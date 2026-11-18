// Pedestrians: they stroll the sidewalks, turn at intersections like the
// traffic, run from gunfire and crashes, and fall when a car or a bullet
// catches them. A few of them want a ride: a fare ped waits with a marker
// over their head until the player pulls up.
import { PALETTE, ROAD, WORLD } from './config.js';
import { distance } from './random.js';
import { nearestRoadPoint, randomSidewalkPoint } from './city.js';

const WALK_SPEED_MIN = 42;
const WALK_SPEED_MAX = 74;
const FLEE_SPEED = 320;

/** Make one pedestrian on a random sidewalk. */
export function createPed(random, city) {
  const point = randomSidewalkPoint(random);
  const road = nearestRoadPoint(point.x, point.y);
  const side = random.pick([-1, 1]) * (ROAD.width / 2 + 12);
  const axis = road.axis;
  const line = road.line;
  const dir = random.pick([-1, 1]);
  return {
    x: axis === 'v' ? line + side : point.x,
    y: axis === 'v' ? point.y : line + side,
    angle: 0,
    speed: random.range(WALK_SPEED_MIN, WALK_SPEED_MAX),
    color: random.pick(PALETTE.ped),
    state: 'walk',
    axis,
    line,
    dir,
    along: axis === 'v' ? point.y : point.x,
    side,
    bob: random.range(0, Math.PI * 2),
    fleeTimer: 0,
    downTimer: 0,
    pauseTimer: 0,
    fare: false,
    fareDest: null,
  };
}

export function spawnPedestrians(random, city, count) {
  const peds = [];
  for (let i = 0; i < count; i += 1) peds.push(createPed(random, city));
  return peds;
}

/** Scare every pedestrian near (x, y): they run away from it. */
export function scarePeds(peds, x, y, radius) {
  for (const ped of peds) {
    if (ped.state !== 'walk') continue;
    if (distance(ped.x, ped.y, x, y) < radius) {
      ped.state = 'flee';
      ped.fleeTimer = 2.2;
      ped.fleeX = x;
      ped.fleeY = y;
    }
  }
}

/** Turn a pedestrian around at the end of their road. */
function turnAround(ped) {
  ped.dir = -ped.dir;
  ped.side = -ped.side;
}

function stepWalk(ped, dt, random) {
  // Every now and then a pedestrian stops to look at a shop window, check
  // a phone, or just stand in the sun — the city reads as lived-in, not
  // as a conveyor belt.
  if (ped.pauseTimer > 0) {
    ped.pauseTimer -= dt;
    ped.bob += dt * 2;
    return;
  }
  if (random.chance(dt * 0.06)) {
    ped.pauseTimer = random.range(0.6, 2.2);
    return;
  }
  const maxAlong = ped.axis === 'v' ? ROAD.beachTop : WORLD.width;
  ped.along += ped.dir * ped.speed * dt;
  if (ped.dir > 0 && ped.along >= maxAlong - 30) turnAround(ped);
  else if (ped.dir < 0 && ped.along <= 30) turnAround(ped);
  // At an intersection, sometimes turn onto the crossing road. The turn
  // lands the pedestrian past the crossing, on the new road's sidewalk, so
  // they never stand in the traffic.
  const cross = ped.axis === 'v' ? ROAD.horizontals : ROAD.verticals;
  for (const c of cross) {
    if (Math.abs(ped.along - c) < 14 && random.chance(0.3)) {
      const oldLine = ped.line;
      ped.axis = ped.axis === 'v' ? 'h' : 'v';
      ped.line = c;
      ped.dir = random.pick([-1, 1]);
      ped.along = oldLine + ped.dir * 44;
      ped.side = random.pick([-1, 1]) * (ROAD.width / 2 + 12);
      break;
    }
  }
  if (ped.axis === 'v') {
    ped.x = ped.line + ped.side;
    ped.y = ped.along;
    ped.angle = ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    ped.x = ped.along;
    ped.y = ped.line + ped.side;
    ped.angle = ped.dir > 0 ? 0 : Math.PI;
  }
  ped.bob += dt * 9;
}

function stepFlee(ped, dt, random) {
  ped.fleeTimer -= dt;
  const away = Math.atan2(ped.y - ped.fleeY, ped.x - ped.fleeX);
  ped.angle = away;
  ped.x += Math.cos(away) * FLEE_SPEED * dt;
  ped.y += Math.sin(away) * FLEE_SPEED * dt;
  ped.x = Math.max(16, Math.min(WORLD.width - 16, ped.x));
  ped.y = Math.max(16, Math.min(WORLD.height - 16, ped.y));
  ped.bob += dt * 14;
  if (ped.fleeTimer <= 0) {
    // Back to the sidewalks: find the nearest road and walk along it.
    const road = nearestRoadPoint(ped.x, ped.y);
    ped.axis = road.axis;
    ped.line = road.line;
    ped.along = road.along;
    ped.dir = random() < 0.5 ? -1 : 1;
    ped.side = (ped.axis === 'v' ? ped.x - ped.line : ped.y - ped.line) || 44;
    ped.side = Math.max(40, Math.min(48, Math.abs(ped.side))) * (ped.side < 0 ? -1 : 1);
    ped.state = 'walk';
  }
}

/** Advance all pedestrians one step. */
export function stepPedestrians(peds, dt, random) {
  for (const ped of peds) {
    if (ped.state === 'down') {
      ped.downTimer -= dt;
      continue;
    }
    if (ped.state === 'flee') {
      stepFlee(ped, dt, random);
      continue;
    }
    stepWalk(ped, dt, random);
  }
}

/** Knock a pedestrian down. Returns true when they went down. */
export function knockDown(ped, fx) {
  if (ped.state === 'down') return false;
  ped.state = 'down';
  ped.downTimer = 6;
  ped.fare = false;
  if (fx) fx.push({ type: 'pedDown', x: ped.x, y: ped.y });
  return true;
}

/** Remove the pedestrians that have been down too long. */
export function sweepDown(peds) {
  for (let i = peds.length - 1; i >= 0; i -= 1) {
    if (peds[i].state === 'down' && peds[i].downTimer <= 0) peds.splice(i, 1);
  }
}
