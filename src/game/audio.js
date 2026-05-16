// Audio — sfx + bgm

const BASE = 'https://github.com/Cybervampccg/cybervamp.github.io/blob/main/play/audio/';
const SOUNDS = {
  card_play:    BASE + 'card_play.mp3?raw=true',
  damage:       BASE + 'damage.mp3?raw=true',
  destroy:      BASE + 'destroy.mp3?raw=true',
  bleed:        BASE + 'bleed.mp3?raw=true',
  phase_change: BASE + 'phase_change.mp3?raw=true',
  turn_end:     BASE + 'turn_end.mp3?raw=true',
  glimpse:      BASE + 'glimpse.mp3?raw=true',
  shuffle:      BASE + 'shuffle.mp3?raw=true',
};
const BGM_URL = BASE + 'bgm.mp3?raw=true';

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
