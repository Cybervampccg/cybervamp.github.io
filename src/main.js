// ─────────────────────────────────────────────────────────────
// Cybervamp v2 — Boot entry
//
// Routes to home screen on startup. The home screen lets you
// open the battle shell or run state-init tests.
// ─────────────────────────────────────────────────────────────

import './styles/main.css';
import { mountHomeScreen } from './screens/home-screen.js';

console.log('Cybervamp v2 booting…');

setTimeout(() => {
  mountHomeScreen(document.getElementById('app'));
}, 300);
