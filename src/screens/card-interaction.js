// ─────────────────────────────────────────────────────────────
// card-interaction.js — Unified gesture handling for cards
//
// Gestures supported:
//   - tap         (quick press+release, no movement, no second tap nearby)
//   - doubleTap   (two taps within 350ms)
//   - longPress   (held for 400ms+ without movement)
//   - drag        (moved past threshold while held; releases anywhere)
//
// Usage:
//   attachCardGestures(element, {
//     onTap: () => {},
//     onDoubleTap: () => {},        // optional
//     onLongPress: () => {},        // optional — opens preview
//     onLongPressMove: (x, y) => {},// optional — called while still pressed AFTER long-press fired
//     onDragStart: () => {},        // optional — called when long-press is interrupted by movement
//     onDragMove: (x, y) => {},     // optional — called during drag
//     onDragEnd: (x, y) => {},      // optional — called on release after drag
//     enableDoubleTap: true|false,  // default false; if true single-tap is delayed
//   });
//
// Returns: { detach } so caller can remove listeners.
// ─────────────────────────────────────────────────────────────

const LONG_PRESS_MS = 400;
const DOUBLE_TAP_MS = 350;
const DRAG_THRESHOLD_PX = 12;

export function attachCardGestures(element, opts = {}) {
  const {
    onTap = null,
    onDoubleTap = null,
    onLongPress = null,
    onDragStart = null,
    onDragMove = null,
    onDragEnd = null,
    enableDoubleTap = false,
  } = opts;

  let startX = 0;
  let startY = 0;
  let pressTime = 0;
  let longPressTimer = null;
  let longPressed = false;
  let dragging = false;
  let lastTapTime = 0;
  let pendingTapTimer = null;
  let pointerActive = false;

  function getXY(ev) {
    const t = ev.touches?.[0] || ev.changedTouches?.[0];
    if (t) return { x: t.clientX, y: t.clientY };
    return { x: ev.clientX || 0, y: ev.clientY || 0 };
  }

  function clearTimers() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    if (pendingTapTimer) { clearTimeout(pendingTapTimer); pendingTapTimer = null; }
  }

  function handleStart(ev) {
    if (pointerActive) return; // ignore secondary touches
    pointerActive = true;
    const { x, y } = getXY(ev);
    startX = x;
    startY = y;
    pressTime = Date.now();
    longPressed = false;
    dragging = false;

    if (onLongPress) {
      longPressTimer = setTimeout(() => {
        longPressed = true;
        longPressTimer = null;
        onLongPress();
      }, LONG_PRESS_MS);
    }
  }

  function handleMove(ev) {
    if (!pointerActive) return;
    const { x, y } = getXY(ev);
    const dx = x - startX;
    const dy = y - startY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > DRAG_THRESHOLD_PX) {
      // Movement — cancel long-press timer
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }

      if (longPressed && !dragging && onDragStart) {
        // Was holding (preview open) — start drag
        dragging = true;
        onDragStart();
      }

      if (dragging && onDragMove) {
        onDragMove(x, y);
        ev.preventDefault?.();
      }
    }
  }

  function handleEnd(ev) {
    if (!pointerActive) return;
    pointerActive = false;
    clearTimers();

    const { x, y } = getXY(ev);
    const heldMs = Date.now() - pressTime;

    if (dragging) {
      if (onDragEnd) onDragEnd(x, y);
      dragging = false;
      longPressed = false;
      return;
    }

    if (longPressed) {
      // They long-pressed but didn't drag — preview stays open, do nothing else
      longPressed = false;
      return;
    }

    // Quick tap
    const dx = x - startX;
    const dy = y - startY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > DRAG_THRESHOLD_PX) {
      // Was a swipe, not a tap
      return;
    }

    if (enableDoubleTap && onDoubleTap) {
      const now = Date.now();
      if (now - lastTapTime < DOUBLE_TAP_MS) {
        // Double tap!
        lastTapTime = 0;
        if (pendingTapTimer) { clearTimeout(pendingTapTimer); pendingTapTimer = null; }
        onDoubleTap();
        return;
      }
      lastTapTime = now;
      // Defer single-tap action to detect possible second tap
      pendingTapTimer = setTimeout(() => {
        pendingTapTimer = null;
        if (onTap) onTap();
      }, DOUBLE_TAP_MS);
    } else {
      // Immediate single-tap
      if (onTap) onTap();
    }
  }

  function handleCancel() {
    pointerActive = false;
    clearTimers();
    if (dragging && onDragEnd) {
      // Pretend they dropped at start (no-op drop)
      onDragEnd(startX, startY);
    }
    longPressed = false;
    dragging = false;
  }

  element.addEventListener('touchstart', handleStart, { passive: true });
  element.addEventListener('touchmove', handleMove, { passive: false });
  element.addEventListener('touchend', handleEnd, { passive: true });
  element.addEventListener('touchcancel', handleCancel, { passive: true });
  element.addEventListener('mousedown', handleStart);
  element.addEventListener('mousemove', handleMove);
  element.addEventListener('mouseup', handleEnd);
  element.addEventListener('mouseleave', handleCancel);

  return {
    detach: () => {
      element.removeEventListener('touchstart', handleStart);
      element.removeEventListener('touchmove', handleMove);
      element.removeEventListener('touchend', handleEnd);
      element.removeEventListener('touchcancel', handleCancel);
      element.removeEventListener('mousedown', handleStart);
      element.removeEventListener('mousemove', handleMove);
      element.removeEventListener('mouseup', handleEnd);
      element.removeEventListener('mouseleave', handleCancel);
    },
  };
}
