// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps, and the renderer paints what is there. The game moves
// between six screens: title, play, paused, busted, wasted and mission
// failed. ?seed=N fixes the city; ?shot=start|drive|chase|mission (with
// &seed=N) stages that scene instead of running the loop, paints it twice
// and sets window.__shotReady for a screenshot.
import { SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_FAILED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';
import { clearWanted } from './police.js';
import { PLACES } from './city.js';

const MAX_FRAME = 0.25;
const HORN_COOLDOWN = 0.45;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (typeof save.cash !== 'number' || typeof save.missionIndex !== 'number') return null;
    return {
      cash: Math.max(0, save.cash),
      missionIndex: Math.max(0, Math.min(6, save.missionIndex)),
      muted: save.muted === true,
    };
  } catch {
    return null;
  }
}

function writeSave(world, muted) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: world.state.cash,
      missionIndex: world.state.missions.index,
      muted: !!muted,
    }));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit.
  }
}

const save = readSave();
const world = createWorld(seed, save);
const state = world.state;
const renderer = createRenderer(canvas);
const audio = createAudio();
if (save && save.muted) audio.setMuted(true);

// A handle for playtesting and screenshots.
window.__solmar = { world, state, seed };

function playFx() {
  for (const fx of state.fx) {
    if (fx.type === 'shot') audio.shoot();
    else if (fx.type === 'crash') audio.crash();
    else if (fx.type === 'explosion') audio.explosion();
    else if (fx.type === 'pickup') audio.pickup();
    else if (fx.type === 'cash') audio.cash();
    else if (fx.type === 'missionDone') audio.missionDone();
    else if (fx.type === 'missionFailed') audio.busted();
    else if (fx.type === 'enterCar') audio.pickup();
  }
  state.fx.length = 0;
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(state, scene.screen, save);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();
  let muted = save ? !!save.muted : false;
  let started = false;
  let hornCooldown = 0;

  function announce(message) {
    status.textContent = message;
  }

  function startAudio() {
    audio.ensure();
    audio.resume();
    audio.startMusic();
  }

  function startGame() {
    startAudio();
    // A stray E pressed on the title screen must not steal a car the
    // moment play starts.
    input.takeActions(ACTION_ENTER);
    state.attract = false;
    screen = SCREEN_PLAY;
    started = true;
    if (!state.missions.active && state.missions.index < 7) {
      // The first job starts when the player is ready; later jobs start
      // when the player drives to the garage.
      world.startMission();
    }
    announce('Playing. Drive to the marker.');
  }

  function respawn(place, fine, label) {
    state.bustFine = fine;
    state.cash = Math.max(0, state.cash - fine);
    const player = state.player;
    if (player.car) {
      player.car.driver = 'parked';
      player.car = null;
    }
    player.x = place.x;
    player.y = place.y;
    player.health = 100;
    player.ammo = Math.max(player.ammo, 24);
    clearWanted(state.police);
    state.camera.x = place.x;
    state.camera.y = place.y;
    if (state.missions.active) world.startMission();
    writeSave(world, muted);
    return label;
  }

  function endBusted() {
    screen = SCREEN_BUSTED;
    const fine = Math.min(200, 50 + Math.floor(state.cash * 0.1));
    respawn(PLACES.policeStation, fine, 'busted');
    audio.busted();
    audio.stopSiren();
    audio.stopEngine();
    announce(`Busted. You lost $${fine}.`);
  }

  function endWasted() {
    screen = SCREEN_WASTED;
    const fine = Math.min(200, 50 + Math.floor(state.cash * 0.1));
    respawn(PLACES.hospital, fine, 'wasted');
    audio.busted();
    audio.stopSiren();
    audio.stopEngine();
    announce(`Wasted. You lost $${fine}.`);
  }

  function endFailed() {
    screen = SCREEN_FAILED;
    announce('Mission failed.');
  }

  function handleActions() {
    // Take only the menu flags here; ACTION_ENTER belongs to the world
    // step, which takes it separately (see input.js).
    const actions = input.takeActions(ACTION_CONFIRM | ACTION_PAUSE | ACTION_MUTE | ACTION_RESTART);
    if (actions & ACTION_MUTE) {
      muted = !muted;
      audio.setMuted(muted);
      writeSave(world, muted);
    }
    if (actions & ACTION_CONFIRM) audio.uiClick();
    if (actions & ACTION_RESTART && screen === SCREEN_PLAY) {
      world.reset();
      writeSave(world, muted);
      screen = SCREEN_TITLE;
      state.attract = true;
      announce('Solmar. Press Enter to start.');
      return;
    }
    if (actions & ACTION_CONFIRM) {
      if (screen === SCREEN_TITLE) startGame();
      else if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      } else if (screen === SCREEN_FAILED) {
        world.startMission();
        screen = SCREEN_PLAY;
        announce('Playing.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
  }

  function mouseWorld() {
    const rect = canvas.getBoundingClientRect();
    const mouse = input.mouse();
    const scaleX = 1280 / rect.width;
    const scaleY = 720 / rect.height;
    const vx = mouse.x * scaleX;
    const vy = mouse.y * scaleY;
    return {
      x: state.camera.x - 640 + vx,
      y: state.camera.y - 360 + vy,
    };
  }

  // The mouse position in view space, for the aim crosshair. It is only
  // set once the mouse has actually moved, so a fresh page never shows a
  // crosshair stuck in the top-left corner.
  function updateAimView() {
    if (!input.hasMouseMoved()) {
      state.aimView = null;
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const mouse = input.mouse();
    state.aimView = { x: mouse.x * (1280 / rect.width), y: mouse.y * (720 / rect.height) };
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      state.attract = true;
      world.step(STEP, null, null);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const result = world.step(STEP, input, mouseWorld());
    if (result.wasted) endWasted();
    else if (result.busted) endBusted();
    else if (state.missions.failed) endFailed();
    // Sound follows the game.
    if (state.player.car) {
      audio.startEngine();
      audio.setEngine(Math.abs(state.player.car.speed) / 560, true);
    } else {
      audio.setEngine(0, false);
    }
    const cops = state.cars.some((car) => car.driver === 'police' && !car.wrecked);
    if (cops && state.police.stars > 0) audio.startSiren();
    else audio.stopSiren();
    // The horn, on a short cooldown so holding H does not machine-gun it.
    hornCooldown = Math.max(0, hornCooldown - STEP);
    if (state.player.car && input.isHorning() && hornCooldown <= 0) {
      audio.horn();
      hornCooldown = HORN_COOLDOWN;
    }
    playFx();
    if (state.time % 1 < STEP) writeSave(world, muted);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    while (accumulator >= STEP && screen !== SCREEN_PAUSED) {
      step();
      accumulator -= STEP;
      if (screen !== SCREEN_PLAY && screen !== SCREEN_TITLE) {
        accumulator = 0;
        break;
      }
    }
    if (screen === SCREEN_PAUSED) accumulator = 0;
    updateAimView();
    renderer.draw(state, screen, save);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  state.attract = true;
  announce('Solmar, Streets of the Sun. Press Enter to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
