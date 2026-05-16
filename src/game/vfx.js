// Visual effects — overlays, animations, haptics, particles

const FACTION_GLOW = {
  Red:    'rgba(224,48,48,0.5)',
  White:  'rgba(200,192,240,0.5)',
  Black:  'rgba(96,48,192,0.5)',
  Purple: 'rgba(160,32,240,0.5)',
};

const PHASE_COLORS = {
  renew:  '#60a5fa',
  main:   '#4ade80',
  combat: '#f43f5e',
  end:    '#eab308',
};

// ── Overlay injection ────────────────────────────────────────

export function injectOverlays() {
  if (document.getElementById('fx-particle-canvas')) return; // already injected

  const canvas = document.createElement('canvas');
  canvas.id = 'fx-particle-canvas';
  document.body.appendChild(canvas);

  const overlays = [
    `<div id="fx-damage-vignette"></div>`,
    `<div id="fx-turn-sweep"></div>`,
    `<div id="fx-turn-banner"><div class="fx-turn-banner-text" id="fx-turn-banner-text"></div></div>`,
    `<div id="fx-hero-backdrop"></div>`,
    `<div id="fx-phase-transition"></div>`,
  ];
  const wrap = document.createElement('div');
  wrap.id = 'fx-overlay-root';
  wrap.innerHTML = overlays.join('');
  document.body.appendChild(wrap);

  _initParticles();
}

export function removeOverlays() {
  document.getElementById('fx-overlay-root')?.remove();
  document.getElementById('fx-particle-canvas')?.remove();
  document.getElementById('fx-endgame-overlay')?.remove();
}

// ── Phase transition ─────────────────────────────────────────

export function showPhaseTransition(phase) {
  const labels = { renew: 'RENEW', main: 'MAIN PHASE', combat: 'COMBAT', end: 'END PHASE' };
  const el = document.getElementById('fx-phase-transition');
  if (!el) return;
  el.textContent = labels[phase] || phase.toUpperCase();
  el.style.setProperty('--phase-color', PHASE_COLORS[phase] || '#eab308');
  el.classList.remove('active');
  void el.offsetWidth;
  el.classList.add('active');
  setTimeout(() => el.classList.remove('active'), 1200);
}

// ── Turn banner + sweep ──────────────────────────────────────

export function showTurnBanner(text, who) {
  const sweep = document.getElementById('fx-turn-sweep');
  if (sweep) {
    sweep.classList.remove('active', 'ai');
    void sweep.offsetWidth;
    if (who === 'ai') sweep.classList.add('ai');
    sweep.classList.add('active');
    setTimeout(() => sweep.classList.remove('active', 'ai'), 900);
  }
  const banner = document.getElementById('fx-turn-banner');
  const textEl = document.getElementById('fx-turn-banner-text');
  if (banner && textEl) {
    textEl.textContent = text;
    banner.classList.add('visible');
    setTimeout(() => banner.classList.remove('visible'), 1600);
  }
}

// ── Damage vignette ──────────────────────────────────────────

export function showDamageVignette() {
  const el = document.getElementById('fx-damage-vignette');
  if (!el) return;
  el.classList.remove('active');
  void el.offsetWidth;
  el.classList.add('active');
  setTimeout(() => el.classList.remove('active'), 500);
}

// ── Floating numbers ─────────────────────────────────────────

export function floatNumber(text, kind, x, y) {
  const el = document.createElement('div');
  el.className = 'float-number ' + (kind || 'damage');
  el.textContent = text;
  el.style.left = x + 'px';
  el.style.top  = y + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

export function floatNumberAtElement(text, kind, anchorEl) {
  if (!anchorEl) return;
  const r = anchorEl.getBoundingClientRect();
  floatNumber(text, kind, r.left + r.width / 2, r.top + r.height / 3);
}

// ── Card animations ──────────────────────────────────────────

export function cardArrive(cardEl) {
  if (!cardEl) return;
  cardEl.classList.remove('card-arrive');
  void cardEl.offsetWidth;
  cardEl.classList.add('card-arrive');
  setTimeout(() => cardEl.classList.remove('card-arrive'), 560);
}

export function cardDrawEnter(cardEl) {
  if (!cardEl) return;
  cardEl.classList.remove('card-draw-enter');
  void cardEl.offsetWidth;
  cardEl.classList.add('card-draw-enter');
  setTimeout(() => cardEl.classList.remove('card-draw-enter'), 380);
}

// ── Screen shake ─────────────────────────────────────────────

export function screenShake() {
  const el = document.querySelector('.battle-playfield') || document.getElementById('app');
  if (!el) return;
  el.classList.remove('screen-shake');
  void el.offsetWidth;
  el.classList.add('screen-shake');
  setTimeout(() => el.classList.remove('screen-shake'), 380);
}

// ── Haptics ──────────────────────────────────────────────────

export function hapticTap()    { if (navigator.vibrate) navigator.vibrate(8); }
export function hapticSelect() { if (navigator.vibrate) navigator.vibrate(15); }
export function hapticAct()    { if (navigator.vibrate) navigator.vibrate(30); }
export function hapticDamage() { if (navigator.vibrate) navigator.vibrate([40, 30, 40]); }
export function hapticWin()    { if (navigator.vibrate) navigator.vibrate([100, 60, 100, 60, 180]); }

// ── Hero moment ──────────────────────────────────────────────

export function showHeroMoment(inst, options = {}) {
  const holdMs     = options.hold     || 1400;
  const onDone     = options.onDone   || (() => {});
  const onResolve  = options.onResolve || null;

  const sourceEl = document.querySelector(`[data-inst-id="${inst.instId}"]`);
  const vw = window.innerWidth, vh = window.innerHeight;
  const heroW = Math.min(vw * 0.38, 160);
  const heroH = heroW * 1.4;
  const heroCenterY = vh * 0.38;

  const hero = document.createElement('div');
  hero.className = 'hero-moment';

  if (sourceEl) {
    const r = sourceEl.getBoundingClientRect();
    hero.style.left   = r.left   + 'px';
    hero.style.top    = r.top    + 'px';
    hero.style.width  = r.width  + 'px';
    hero.style.height = r.height + 'px';
  } else {
    hero.style.left   = (vw/2 - heroW/2) + 'px';
    hero.style.top    = (heroCenterY - heroH/2) + 'px';
    hero.style.width  = heroW + 'px';
    hero.style.height = heroH + 'px';
  }

  const glowColor = FACTION_GLOW[inst.faction] || 'rgba(255,220,100,0.5)';
  hero.style.setProperty('--hero-glow', glowColor);

  if (inst.image) {
    const img = document.createElement('img');
    img.className = 'hero-art';
    img.src = inst.image;
    img.onerror = () => { img.style.display = 'none'; };
    hero.appendChild(img);
  }

  const nameEl = document.createElement('div');
  nameEl.className = 'hero-name-overlay';
  nameEl.textContent = inst.name || '';
  hero.appendChild(nameEl);

  document.body.appendChild(hero);

  const backdrop = document.getElementById('fx-hero-backdrop');
  if (backdrop) {
    const bg = glowColor.replace(/,\s*[\d.]+\)$/, ',0.28)');
    backdrop.style.setProperty('--hero-backdrop-glow', bg);
    backdrop.classList.add('active');
  }

  if (sourceEl) sourceEl.style.opacity = '0.15';

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      hero.style.left   = (vw/2 - heroW/2) + 'px';
      hero.style.top    = (heroCenterY - heroH/2) + 'px';
      hero.style.width  = heroW + 'px';
      hero.style.height = heroH + 'px';
      hero.classList.add('lifting');
    });
  });

  setTimeout(() => {
    hero.classList.remove('lifting');
    hero.classList.add('holding');
    if (onResolve) onResolve();
  }, 450);

  setTimeout(() => {
    hero.classList.remove('holding');
    hero.style.opacity = '0';
    if (backdrop) backdrop.classList.remove('active');
    setTimeout(() => {
      hero.remove();
      if (sourceEl) sourceEl.style.opacity = '';
      onDone();
    }, 400);
  }, 450 + holdMs);
}

// ── Endgame overlay ──────────────────────────────────────────

export function showEndgame(winner, stats = {}) {
  let overlay = document.getElementById('fx-endgame-overlay');
  if (overlay) overlay.remove();

  const isVictory = winner === 'player';
  overlay = document.createElement('div');
  overlay.id = 'fx-endgame-overlay';
  overlay.className = isVictory ? 'victory' : 'defeat';

  overlay.innerHTML = `
    <div class="eg-starfield"></div>
    <div class="eg-inner">
      <div class="eg-glyph">${isVictory ? '⚡' : '💀'}</div>
      <div class="eg-title">${isVictory ? 'VICTORY' : 'DEFEAT'}</div>
      <div class="eg-subtitle">
        ${isVictory ? 'The enemy falls. Blood flows freely.' : 'You have been overwhelmed.'}
      </div>
      <div class="eg-stats">
        <div class="eg-stat">
          <div class="eg-stat-val">${stats.turn || 1}</div>
          <div class="eg-stat-label">Turns</div>
        </div>
        <div class="eg-stat">
          <div class="eg-stat-val">${stats.cardsPlayed || 0}</div>
          <div class="eg-stat-label">Cards Played</div>
        </div>
        <div class="eg-stat">
          <div class="eg-stat-val">${stats.damageDealt || 0}</div>
          <div class="eg-stat-label">Dmg Dealt</div>
        </div>
      </div>
      <div class="eg-actions">
        <button class="eg-btn eg-btn-primary" id="eg-btn-play-again">⚔ PLAY AGAIN</button>
        <button class="eg-btn" id="eg-btn-home">⌂ HOME</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => { overlay.classList.add('visible'); });
  });
}

// ── Mute button ──────────────────────────────────────────────

export function createMuteButton(onToggle) {
  let btn = document.getElementById('fx-mute-btn');
  if (btn) return btn;
  btn = document.createElement('button');
  btn.id = 'fx-mute-btn';
  btn.title = 'Toggle Music/SFX';
  btn.textContent = '🔊';
  btn.addEventListener('click', () => {
    const muted = onToggle();
    btn.textContent = muted ? '🔇' : '🔊';
  });
  document.body.appendChild(btn);
  return btn;
}

export function removeMuteButton() {
  document.getElementById('fx-mute-btn')?.remove();
}

// ── Particle canvas ──────────────────────────────────────────

function _initParticles() {
  const canvas = document.getElementById('fx-particle-canvas');
  if (!canvas || typeof canvas.getContext !== 'function') return;
  const ctx = canvas.getContext('2d');
  let W, H, particles = [];

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  function mkP() {
    return {
      x: Math.random() * W, y: H + 10,
      vy: -(0.15 + Math.random() * 0.35),
      vx: (Math.random() - 0.5) * 0.2,
      size: 1 + Math.random() * 2.5,
      alpha: 0.3 + Math.random() * 0.4,
      color: Math.random() < 0.5 ? '180,30,30' : '120,20,180',
      life: 0, maxLife: 200 + Math.random() * 300,
    };
  }

  for (let i = 0; i < 60; i++) {
    const p = mkP(); p.y = Math.random() * H; p.life = Math.random() * p.maxLife;
    particles.push(p);
  }

  let _running = true;
  function frame() {
    if (!_running) return;
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.life++;
      const fade = Math.min(p.life / 40, 1) * Math.min((p.maxLife - p.life) / 40, 1);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.color},${p.alpha * fade})`;
      ctx.fill();
      if (p.life >= p.maxLife || p.y < -10) particles[i] = mkP();
    }
    requestAnimationFrame(frame);
  }
  frame();

  // Stop when canvas is removed
  const obs = new MutationObserver(() => {
    if (!document.contains(canvas)) { _running = false; obs.disconnect(); }
  });
  obs.observe(document.body, { childList: true, subtree: true });
}
