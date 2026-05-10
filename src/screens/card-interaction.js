// ─────────────────────────────────────────────────────────────
// card-interaction.js — Unified gesture handling for cards
//
// Gestures:
//   - tap         (quick press+release, no movement)
//   - doubleTap   (two taps within 350ms; opt-in via enableDoubleTap)
//   - longPress   (held for 400ms+ without movement)
//   - drag        (moved past threshold while held — works WITHOUT long-press)
//
// Drag changes:
//   - Drag now triggers on ANY movement past threshold during press
//   - If long-press fired (preview open), drag still works the same way
//   - Single tap is detected only if NEITHER drag NOR long-press happened
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
    if (pointerActive) return;
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
      // Movement detected — cancel long-press timer
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }

      // Start drag on first movement past threshold (regardless of long-press state)
      if (!dragging && onDragStart) {
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

    if (dragging) {
      if (onDragEnd) onDragEnd(x, y);
      dragging = false;
      longPressed = false;
      return;
    }

    if (longPressed) {
      // Long-pressed but didn't move — preview stays open
      longPressed = false;
      return;
    }

    // Quick tap
    const dx = x - startX;
    const dy = y - startY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > DRAG_THRESHOLD_PX) return;

    if (enableDoubleTap && onDoubleTap) {
      const now = Date.now();
      if (now - lastTapTime < DOUBLE_TAP_MS) {
        lastTapTime = 0;
        if (pendingTapTimer) { clearTimeout(pendingTapTimer); pendingTapTimer = null; }
        onDoubleTap();
        return;
      }
      lastTapTime = now;
      pendingTapTimer = setTimeout(() => {
        pendingTapTimer = null;
        if (onTap) onTap();
      }, DOUBLE_TAP_MS);
    } else {
      if (onTap) onTap();
    }
  }

  function handleCancel() {
    pointerActive = false;
    clearTimers();
    if (dragging && onDragEnd) {
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
