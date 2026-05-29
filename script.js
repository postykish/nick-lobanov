// ─── НАСТРОЙКИ ───────────────────────────────────────────────────────────────
// Замени на ID своей Google Таблицы (из URL таблицы)
const SHEET_ID = '1LuasUcthP8BrWx085vm3-hzOUJNWbInKogwMtf_W0cw';
const SHEET_NAME = 'Works';
// ─────────────────────────────────────────────────────────────────────────────

// Демо-данные (показываются пока нет таблицы)
// В таблице нужны только 3 колонки: spotify_url, yandex_url, tags
const DEMO_TRACKS = [
  {
    spotify_id: '6ut2JQPHZs91okyzdgECbE', spotify_type: 'track',
    yandex_url: 'https://music.yandex.ru/album/39927982/track/146597127',
    tags: ['mixing', 'mastering', 'production'],
    title: '', artist: '', cover_url: ''
  },
  {
    spotify_id: '1lCBGRPjRKzi3nE20Vhnnq', spotify_type: 'track',
    yandex_url: 'https://music.yandex.ru/album/33937021/track/132733560',
    tags: ['mastering'],
    title: '', artist: '', cover_url: ''
  }
];

let allTracks = [];
let currentFilter = 'all';
let activeIframes = [];
let currentLang = localStorage.getItem('lang') || 'ru';

// ─── ПЕРЕКЛЮЧАТЕЛЬ ЯЗЫКА RU/EN ────────────────────────────────────────────────
function applyLang(lang) {
  currentLang = lang;
  localStorage.setItem('lang', lang);
  document.documentElement.lang = lang;

  // Тексты с data-ru / data-en (заголовки услуг, описания, кнопки)
  document.querySelectorAll('[data-ru][data-en]').forEach(el => {
    const val = el.getAttribute('data-' + lang);
    if (val !== null) el.textContent = val;
  });

  // Блоки целиком с переключаемой версткой (about-текст)
  document.querySelectorAll('[data-lang-block]').forEach(el => {
    el.style.display = el.getAttribute('data-lang-block') === lang ? '' : 'none';
  });

  // Подсветка активной кнопки в шапке
  document.querySelectorAll('.lang-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.lang === lang);
  });
}

document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => applyLang(btn.dataset.lang));
});

// Применяем сохранённый язык при загрузке
applyLang(currentLang);

// ─── NAV SCROLL ───────────────────────────────────────────────────────────────
window.addEventListener('scroll', () => {
  document.getElementById('nav').classList.toggle('scrolled', window.scrollY > 40);
});

// ─── DROPDOWN (тап на мобиле / hover на десктопе) ─────────────────────────────
const dropdown = document.querySelector('.nav-dropdown');
const trigger = document.querySelector('.nav-trigger');
trigger.addEventListener('click', (e) => {
  if (window.innerWidth <= 768) {
    e.preventDefault();
    dropdown.classList.toggle('open');
  }
});
// Закрываем при клике вне dropdown
document.addEventListener('click', (e) => {
  if (!dropdown.contains(e.target)) dropdown.classList.remove('open');
});
// Закрываем после выбора фильтра
document.querySelectorAll('.dropdown-menu a').forEach(a => {
  a.addEventListener('click', () => dropdown.classList.remove('open'));
});

// ─── INTERSECTION OBSERVER (анимации появления) ───────────────────────────────
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
}, { threshold: 0.1 });

document.querySelectorAll('.service-item').forEach(el => observer.observe(el));

// ─── GOOGLE SHEETS ────────────────────────────────────────────────────────────
async function loadFromSheets() {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${SHEET_NAME}&headers=0`;
    const res = await fetch(url);
    const text = await res.text();
    const json = JSON.parse(text.slice(47, -2));
    const rows = json.table.rows;

    // Берём заголовки из первой строки таблицы
    const headerRow = rows[0];
    const cols = headerRow.c.map(c => c && c.v ? String(c.v).toLowerCase().trim() : '');
    const dataRows = rows.slice(1);

    allTracks = dataRows.map(row => {
      const get = (key) => {
        const i = cols.indexOf(key);
        return i >= 0 && row.c[i] ? row.c[i].v || '' : '';
      };
      const tagsRaw = get('tags');
      const spotifyUrl = get('spotify_url');
      return {
        title: get('title'),
        artist: get('artist'),
        cover_url: get('cover_url'),
        tags: tagsRaw ? tagsRaw.split(',').map(t => t.trim().toLowerCase()) : [],
        yandex_url: get('yandex_url'),
        spotify_id: extractSpotify(spotifyUrl).id,
        spotify_type: extractSpotify(spotifyUrl).type
      };
    }).filter(t => t.spotify_id || t.yandex_url);

    await enrichWithSpotify(allTracks);
    renderTracks(allTracks);
  } catch (e) {
    console.warn('Sheets недоступен, показываем демо', e);
    allTracks = DEMO_TRACKS;
    await enrichWithSpotify(allTracks);
    renderTracks(allTracks);
  }
}

function extractSpotify(url) {
  if (!url) return { id: '', type: '' };
  const tm = String(url).match(/track\/([a-zA-Z0-9]+)/);
  if (tm) return { id: tm[1], type: 'track' };
  const am = String(url).match(/album\/([a-zA-Z0-9]+)/);
  if (am) return { id: am[1], type: 'album' };
  return { id: '', type: '' };
}

function extractSpotifyId(url) {
  if (!url) return '';
  const m = url.match(/track\/([a-zA-Z0-9]+)/);
  return m ? m[1] : url;
}

// ─── SPOTIFY oEMBED (обложки, название, исполнитель — всё автоматически) ──────
async function enrichWithSpotify(tracks) {
  await Promise.all(tracks.map(async (track) => {
    if (!track.spotify_id) return;
    try {
      const type = track.spotify_type || 'track';
      const url = `https://open.spotify.com/oembed?url=https://open.spotify.com/${type}/${track.spotify_id}`;
      const res = await fetch(url);
      const data = await res.json();
      // Обложка
      if (data.thumbnail_url && !track.cover_url) track.cover_url = data.thumbnail_url;
      // Название и исполнитель из поля title вида "Song Name by Artist Name"
      if (data.title) {
        const parts = data.title.split(' by ');
        if (!track.title) track.title = parts[0] || '';
        if (!track.artist && parts[1]) track.artist = parts[1];
      }
    } catch (e) { /* не загрузилось — покажем placeholder */ }
  }));
}

// ─── РЕНДЕР КАРТОЧЕК ──────────────────────────────────────────────────────────
// ─── РЕНДЕР + ПАГИНАЦИЯ ───────────────────────────────────────────────────────
const PAGE_SIZE = window.innerWidth > 768 ? 8 : 6;
let visibleCount = PAGE_SIZE;

function renderTracks(tracks) {
  const grid = document.getElementById('works-grid');
  grid.innerHTML = '';

  if (!tracks.length) {
    grid.innerHTML = '<div class="loading">работы скоро появятся...</div>';
    document.getElementById('load-more').style.display = 'none';
    return;
  }

  tracks.forEach((track, i) => {
    const card = document.createElement('div');
    card.className = 'track-card';
    card.dataset.tags = track.tags.join(',');

    // Уменьшаем размер обложки с Яндекса (m1000x1000 → m400x400) - быстрее грузится
    let coverUrl = track.cover_url || '';
    if (coverUrl.includes('avatars.yandex.net') && coverUrl.includes('m1000x1000')) {
      coverUrl = coverUrl.replace('m1000x1000', 'm400x400');
    }
    // Первые 8 карточек грузим сразу (видны на экране), остальные лениво
    const loadingAttr = i < 8 ? 'eager' : 'lazy';
    const coverHTML = coverUrl
      ? `<img class="track-cover" src="${coverUrl}" alt="${track.title}" loading="${loadingAttr}" decoding="async">`
      : `<div class="track-cover-placeholder">no cover</div>`;

    const tagsHTML = track.tags.map(t => `<span class="tag">#${t}</span>`).join('');

    card.innerHTML = `
      ${coverHTML}
      <p class="track-artist">${track.artist}</p>
      <p class="track-title">${track.title}</p>
      <div class="track-tags">${tagsHTML}</div>
      <span class="track-play">▶ play</span>
    `;

    card.addEventListener('click', () => openModal(track));
    grid.appendChild(card);
    setTimeout(() => card.classList.add('visible'), i * 60);
  });

  applyFilter(currentFilter);
}

// ─── ФИЛЬТРАЦИЯ ───────────────────────────────────────────────────────────────
document.getElementById('filters').addEventListener('click', (e) => {
  if (!e.target.classList.contains('filter-btn')) return;
  setFilter(e.target.dataset.filter);
});

// Связь с dropdown в шапке
document.querySelectorAll('.dropdown-menu a').forEach(a => {
  a.addEventListener('click', (e) => {
    setFilter(a.dataset.filter);
    // dropdown сам закроется
  });
});

function setFilter(filter) {
  currentFilter = filter;
  visibleCount = PAGE_SIZE;

  // Подсветка кнопки-фильтра
  document.querySelectorAll('.filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === filter);
  });
  // Подсветка пункта в dropdown
  document.querySelectorAll('.dropdown-menu a').forEach(a => {
    a.classList.toggle('current', a.dataset.filter === filter);
  });

  applyFilter(filter);
}

function applyFilter(filter) {
  const cards = [...document.querySelectorAll('.track-card')];
  let shown = 0;

  cards.forEach(card => {
    const tags = card.dataset.tags.split(',');
    const matches = filter === 'all' || tags.includes(filter);
    if (matches && shown < visibleCount) {
      card.classList.remove('hidden');
      shown++;
    } else {
      card.classList.add('hidden');
    }
  });

  const totalMatching = cards.filter(card => {
    const tags = card.dataset.tags.split(',');
    return filter === 'all' || tags.includes(filter);
  }).length;

  const loadMoreBtn = document.getElementById('load-more');
  loadMoreBtn.style.display = totalMatching > visibleCount ? 'inline-block' : 'none';

  updateRowBorders();
}

// Считает сколько колонок сейчас
function getCurrentColumns() {
  const w = window.innerWidth;
  if (w <= 360) return 1;
  if (w <= 768) return 2;
  if (w <= 1024) return 3;
  return 4;
}

// Добавляет невидимые заглушки в конец сетки, чтобы последний ряд был полным
function updateRowBorders() {
  const grid = document.getElementById('works-grid');
  // Убираем старые заглушки
  grid.querySelectorAll('.track-filler').forEach(el => el.remove());

  const visible = grid.querySelectorAll('.track-card:not(.hidden)').length;
  if (!visible) return;

  const cols = getCurrentColumns();
  const remainder = visible % cols;
  if (remainder === 0) return;

  const fillersNeeded = cols - remainder;
  for (let i = 0; i < fillersNeeded; i++) {
    const filler = document.createElement('div');
    filler.className = 'track-filler';
    grid.appendChild(filler);
  }
}

window.addEventListener('resize', () => {
  updateRowBorders();
});

document.getElementById('load-more').addEventListener('click', () => {
  visibleCount += PAGE_SIZE;
  applyFilter(currentFilter);
});

// ─── МОДАЛЬНОЕ ОКНО ───────────────────────────────────────────────────────────
function openModal(track) {
  stopAllPlayers();

  document.getElementById('modal-artist').textContent = track.artist;
  document.getElementById('modal-title').textContent = track.title;

  const playersDiv = document.getElementById('modal-players');
  playersDiv.innerHTML = '';

  if (track.yandex_url) {
    const albumMatch = track.yandex_url.match(/album\/(\d+)\/track\/(\d+)/);
    if (albumMatch) {
      // Хэш-формат iframe — стабильнее на мобильных
      const iframeSrc = `https://music.yandex.ru/iframe/#track/${albumMatch[2]}/${albumMatch[1]}`;
      playersDiv.innerHTML += `
        <div>
          <p class="player-label">// яндекс музыка</p>
          <iframe class="player-iframe" frameborder="0" allow="clipboard-write"
            style="border:none;width:100%;height:100px;"
            src="${iframeSrc}"></iframe>
        </div>`;
    }
  }

  if (track.spotify_id) {
    playersDiv.innerHTML += `
      <div>
        <p class="player-label">// spotify</p>
        <iframe class="player-iframe" style="border-radius:4px;width:100%;${(track.spotify_type==='album')?'height:352px':'height:100px'};"
          src="https://open.spotify.com/embed/${track.spotify_type || 'track'}/${track.spotify_id}?utm_source=generator&theme=0"
          frameborder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"></iframe>
      </div>`;
  }

  const tagsDiv = document.getElementById('modal-tags');
  tagsDiv.innerHTML = track.tags.map(t => `<span class="tag">#${t}</span>`).join('');

  activeIframes = playersDiv.querySelectorAll('.player-iframe');
  document.getElementById('modal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  stopAllPlayers();
  document.getElementById('modal').style.display = 'none';
  document.body.style.overflow = '';
}

function stopAllPlayers() {
  activeIframes.forEach(iframe => {
    const src = iframe.src;
    iframe.src = '';
    iframe.src = src;
  });
  activeIframes = [];
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

// ─── СТАРТ ────────────────────────────────────────────────────────────────────
loadFromSheets();
