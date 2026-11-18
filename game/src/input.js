// Keyboard and mouse input. Held keys are read every step; one-shot presses
// (enter a car, pause, confirm) are queued as flags and taken once by the
// loop, so a press between two frames is never lost and never counted twice.
// The mouse position is kept in canvas coordinates for aiming, and the
// renderer only draws an aim crosshair once the mouse has actually moved.
import { KEYS } from './config.js';

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_MUTE = 8;
export const ACTION_RESTART = 16;

function has(list, code) {
  return list.indexOf(code) !== -1;
}

// One-shot keys, each mapped to the flag it raises. Held keys (movement,
// run, brake, horn) are handled separately below.
const ONE_SHOT = [
  [KEYS.confirm, ACTION_CONFIRM],
  [KEYS.pause, ACTION_PAUSE],
  [KEYS.enter, ACTION_ENTER],
  [KEYS.mute, ACTION_MUTE],
  [KEYS.restart, ACTION_RESTART],
];

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;
  let mouseClicked = false;
  let mouseMoved = false;

  function onKeyDown(event) {
    for (const [codes, flag] of ONE_SHOT) {
      if (has(codes, event.code)) {
        if (!event.repeat) actions |= flag;
        // Enter, M and R keep the browser's default behaviour; the rest
        // (arrows, space, Enter) would scroll or click, so stop them.
        if (flag === ACTION_CONFIRM || flag === ACTION_PAUSE) event.preventDefault();
        return;
      }
    }
    if (has(KEYS.up, event.code) || has(KEYS.down, event.code) || has(KEYS.left, event.code)
      || has(KEYS.right, event.code) || has(KEYS.run, event.code) || has(KEYS.brake, event.code)
      || has(KEYS.horn, event.code)) {
      held.add(event.code);
      event.preventDefault();
    }
  }

  function onKeyUp(event) {
    held.delete(event.code);
  }

  function onBlur() {
    held.clear();
    mouseDown = false;
  }

  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    mouseMoved = true;
  }

  function onMouseDown(event) {
    onMouseMove(event);
    mouseDown = true;
    mouseClicked = true;
  }

  function onMouseUp() {
    mouseDown = false;
  }

  function onContextMenu(event) {
    event.preventDefault();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('contextmenu', onContextMenu);

  function axis(positive, negative) {
    const p = positive.some((code) => held.has(code));
    const n = negative.some((code) => held.has(code));
    return (p ? 1 : 0) - (n ? 1 : 0);
  }

  return {
    /** Steering: -1 left, 1 right, 0 neither or both. */
    steer() {
      return axis(KEYS.right, KEYS.left);
    },
    /** Throttle: -1 reversing, 1 forward, 0 neither or both. */
    throttle() {
      return axis(KEYS.up, KEYS.down);
    },
    /** On foot: -1 up, 1 down. */
    moveY() {
      return axis(KEYS.down, KEYS.up);
    },
    /** On foot: -1 left, 1 right. */
    moveX() {
      return axis(KEYS.right, KEYS.left);
    },
    isRunning() {
      return KEYS.run.some((code) => held.has(code));
    },
    isBraking() {
      return KEYS.brake.some((code) => held.has(code));
    },
    isHorning() {
      return KEYS.horn.some((code) => held.has(code));
    },
    /**
     * The one-shot presses since the last call, as ACTION_* flags. With a
     * mask, only the flags in it are taken (the rest stay queued): the
     * main loop takes the menu flags and the world step takes ACTION_ENTER,
     * so a press of E is never eaten by the menu handler.
     */
    takeActions(mask) {
      if (mask === undefined) {
        const taken = actions;
        actions = 0;
        return taken;
      }
      const taken = actions & mask;
      actions &= ~mask;
      return taken;
    },
    /** Mouse position in canvas CSS pixels. */
    mouse() {
      return { x: mouseX, y: mouseY };
    },
    /** True once the mouse has moved over the canvas at least once. */
    hasMouseMoved() {
      return mouseMoved;
    },
    isMouseDown() {
      return mouseDown;
    },
    /** True once after a click, then consumed. */
    takeClick() {
      const clicked = mouseClicked;
      mouseClicked = false;
      return clicked;
    },
  };
}
