// Audio — sfx + bgm
// Files are served from /audio/ (Vite public/ folder → public/audio/*.mp3)

const BASE = '/audio/';
const SOUNDS = {
  card_play:    BASE + 'card_play.mp3',
  damage:       BASE + 'damage.mp3',
  destroy:      BASE + 'destroy.mp3',
  bleed:        BASE + 'bleed.mp3',
  phase_change: BASE + 'phase_change.mp3',
  turn_end:     BASE + 'turn_end.mp3',
  glimpse:      BASE + 'glimpse.mp3',
  shuffle:      BASE + 'shuffle.mp3',
  land:         BASE + 'land.mp3',
};
const BGM_URL = BASE + 'bgm.mp3';

const _cache = {};
let _sfxMuted = false;
let _bgm = null;

function _getAudio(key) {
  if (!_cache[key]) {
    _cache[key] = new Audio(SOUNDS[key]);
    _cache[key].preload = 'auto';
  }
  return _cache[key];
}

export function sfx(key, volume = 0.65) {
  if (_sfxMuted || !SOUNDS[key]) return;
  try {
    const a = _getAudio(key).cloneNode();
    a.volume = volume;
    a.play().catch(() => {});
  } catch (e) {}
}

function _initBGM() {
  if (_bgm) return;
  _bgm = new Audio(BGM_URL);
  _bgm.loop = true;
  _bgm.volume = 0.35;
  _bgm.preload = 'auto';
}

export function bgmFadeIn(duration = 2000) {
  if (_sfxMuted) return;
  _initBGM();
  _bgm.volume = 0;
  const p = _bgm.play();
  if (p && typeof p.then === 'function') {
    p.then(() => {
      const step = 0.35 / (duration / 50);
      const iv = setInterval(() => {
        if (!_bgm) { clearInterval(iv); return; }
        _bgm.volume = Math.min(0.35, _bgm.volume + step);
        if (_bgm.volume >= 0.35) clearInterval(iv);
      }, 50);
    }).catch(() => {
      document.addEventListener('click', () => bgmFadeIn(duration), { once: true });
    });
  }
}

export function bgmPause() {
  if (_bgm && !_bgm.paused) _bgm.pause();
}

export function toggleMute() {
  _sfxMuted = !_sfxMuted;
  if (_sfxMuted) bgmPause();
  else bgmFadeIn();
  return _sfxMuted;
}

export function isMuted() { return _sfxMuted; }

export function preloadAudio() {
  Object.keys(SOUNDS).forEach(k => _getAudio(k));
  _initBGM();
}
