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

// ─── NAV SCROLL ───────────────────────────────────────────────────────────────
window.addEventListener('scroll', () => {
  document.getElementById('nav').classList.toggle('scrolled', window.scrollY > 40);
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
        cover_url: '',
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
      if (data.thumbnail_url) track.cover_url = data.thumbnail_url;
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
function renderTracks(tracks) {
  const grid = document.getElementById('works-grid');
  grid.innerHTML = '';

  if (!tracks.length) {
    grid.innerHTML = '<div class="loading">работы скоро появятся...</div>';
    return;
  }

  tracks.forEach((track, i) => {
    const card = document.createElement('div');
    card.className = 'track-card';
    card.dataset.tags = track.tags.join(',');

    const coverHTML = track.cover_url
      ? `<img class="track-cover" src="${track.cover_url}" alt="${track.title}" loading="lazy">`
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

    setTimeout(() => {
      observer.observe(card);
      setTimeout(() => card.classList.add('visible'), i * 80);
    }, 0);
  });

  applyFilter(currentFilter);
}

// ─── ФИЛЬТРАЦИЯ ───────────────────────────────────────────────────────────────
document.getElementById('filters').addEventListener('click', (e) => {
  if (!e.target.classList.contains('filter-btn')) return;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  e.target.classList.add('active');
  currentFilter = e.target.dataset.filter;
  applyFilter(currentFilter);
});

function applyFilter(filter) {
  document.querySelectorAll('.track-card').forEach(card => {
    const tags = card.dataset.tags.split(',');
    const show = filter === 'all' || tags.includes(filter);
    card.classList.toggle('hidden', !show);
  });
}

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
      const iframeSrc = `https://music.yandex.ru/iframe/album/${albumMatch[1]}/track/${albumMatch[2]}`;
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
