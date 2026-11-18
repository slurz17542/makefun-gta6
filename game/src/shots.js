// The screenshot scenes behind ?shot=start|drive|chase|mission. Each one
// plays the real rules forward from a fresh world for a fixed number of
// steps — the traffic drives, the police chase, the missions run — steered by
// the road autopilot, so the frame is what a short game really looks like
// and the same seed always gives the same frame.
import { STEP, WORLD } from './config.js';
import { PLACES } from './city.js';
import { createCar, autopilotDrive, placeOnLeg, routeWaypoints } from './vehicles.js';
import { addCrime } from './police.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { distance } from './random.js';

const START_SECONDS = 5;
const DRIVE_SECONDS = 5;
const CHASE_SECONDS = 4;
const MISSION_SECONDS = 6;

/**
 * A fake input device that drives the player's car with the road autopilot.
 * The drive is computed once per step and cached, so steer() and throttle()
 * agree with each other.
 */
function autopilotInput(car, target) {
  const waypoints = routeWaypoints(car.x, car.y, target.x, target.y);
  let cached = null;
  return {
    nextStep() {
      cached = null;
    },
    drive() {
      if (!cached) cached = autopilotDrive(car, target, waypoints);
      return cached;
    },
    steer() {
      return this.drive().steer;
    },
    throttle() {
      return this.drive().throttle;
    },
    moveX() {
      return 0;
    },
    moveY() {
      return 0;
    },
    isRunning() {
      return false;
    },
    isBraking() {
      return this.drive().brake;
    },
    takeActions() {
      return 0;
    },
    mouse() {
      return { x: 0, y: 0 };
    },
    isMouseDown() {
      return false;
    },
    takeClick() {
      return false;
    },
  };
}

function putPlayerInCar(world, kind, x, y, angle) {
  const state = world.state;
  const car = createCar(state.random, kind, x, y, angle, 'parked');
  state.cars.push(car);
  state.player.car = car;
  car.driver = 'player';
  state.player.x = car.x;
  state.player.y = car.y;
  state.player.angle = car.angle;
  return car;
}

function runSteps(world, seconds, input) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (input) input.nextStep();
    const result = world.step(STEP, input, null);
    if (result.wasted) world.state.player.health = 100;
    if (result.busted) world.state.police.bustTimer = 0;
  }
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * Any other name is the start scene.
 */
export function stageShot(name, world) {
  const state = world.state;
  world.reset();
  if (name !== 'drive' && name !== 'chase' && name !== 'mission') {
    state.attract = true;
    runSteps(world, START_SECONDS, null);
    state.attract = false;
    return { screen: SCREEN_TITLE };
  }

  state.attract = false;
  if (name === 'drive') {
    // Mara in a sports car on the Avenida del Sol, heading for the garage
    // on her first job: the objective and its marker are on the HUD.
    const car = putPlayerInCar(world, 'sport', 1400, 200, Math.PI / 2);
    world.startMission();
    const input = autopilotInput(car, { x: PLACES.garage.x, y: PLACES.garage.y });
    runSteps(world, DRIVE_SECONDS, input);
    state.missions.bannerTimer = 0;
    return { screen: SCREEN_PLAY };
  }

  if (name === 'chase') {
    // Three stars and the PD on her tail, straight up the boulevard. The
    // player faces north on the x=1400 road with a single straight target
    // (1400, 200), so the autopilot never has to make a 90-degree turn at
    // speed — the old staging turned east at the top of the map and the
    // car overshot into the buildings. One patrol car starts on the same
    // road 200 units behind her, heading north, so the chase is in the
    // frame from the first second instead of arriving later. Four seconds
    // is the whole straight run: the car is still on the road, at speed,
    // when the frame is taken.
    const car = putPlayerInCar(world, 'sport', 1400, 2000, -Math.PI / 2);
    addCrime(state.police, 3);
    const lead = createCar(state.random, 'cop', 0, 0, 0, 'police');
    placeOnLeg(lead, 'v', 1400, -1, 2200);
    lead.cruise = 340;
    state.cars.push(lead);
    const input = autopilotInput(car, { x: 1400, y: 200 });
    runSteps(world, CHASE_SECONDS, input);
    state.missions.bannerTimer = 0;
    state.player.health = 100;
    return { screen: SCREEN_PLAY };
  }

  // Mission: the package run, on the delivery leg with the timer running.
  const car = putPlayerInCar(world, 'sedan', 600, 2200, -Math.PI / 2);
  state.missions.index = 1;
  world.startMission();
  state.missions.step = 1;
  state.missions.timer = 0;
  const input = autopilotInput(car, { x: PLACES.motel.x, y: PLACES.motel.y });
  runSteps(world, MISSION_SECONDS, input);
  state.missions.bannerTimer = 0;
  return { screen: SCREEN_PLAY };
}
