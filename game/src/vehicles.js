// Cars: the player's free-driving physics, the traffic that follows the road
// grid, and the waypoint autopilot the screenshot scenes (and the mission
// drivers) use. Traffic cars move in one dimension along their road leg and
// turn at intersections, which keeps them on the roads and out of the
// buildings by construction; the player's car drives freely and collides.
import { CAR, PALETTE, ROAD, WORLD } from './config.js';
import { angleDelta, approach, clamp, distance } from './random.js';
import { hitBuilding, isWater } from './city.js';

export const KIND_SPECS = {
  sedan: { maxSpeed: 420, accel: 380, length: 54, width: 26 },
  sport: { maxSpeed: 560, accel: 460, length: 52, width: 26 },
  taxi: { maxSpeed: 430, accel: 380, length: 54, width: 26 },
  cop: { maxSpeed: 520, accel: 480, length: 54, width: 26 },
  van: { maxSpeed: 360, accel: 300, length: 62, width: 28 },
  truck: { maxSpeed: 330, accel: 260, length: 68, width: 30 },
};

let nextId = 1;

/** Make a car. `driver` is 'player', 'traffic', 'police' or 'parked'. */
export function createCar(random, kind, x, y, angle, driver) {
  const spec = KIND_SPECS[kind];
  const color = kind === 'cop' ? PALETTE.cop : kind === 'taxi' ? PALETTE.taxi : random.pick(PALETTE.car);
  return {
    id: nextId++,
    kind,
    driver,
    x,
    y,
    angle,
    speed: 0,
    color,
    length: spec.length,
    width: spec.width,
    maxSpeed: spec.maxSpeed,
    accel: spec.accel,
    health: CAR.health,
    wrecked: false,
    smoke: 0,
    // Traffic legs (only traffic/police use them).
    leg: null,
    along: 0,
    lane: 0,
    cruise: random.range(140, 215),
    turnBlend: 0,
    skid: 0,
  };
}

/** Heading of a road leg, in radians. */
export function legHeading(axis, dir) {
  if (axis === 'v') return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  return dir > 0 ? 0 : Math.PI;
}

/** Put a car on a road leg, facing along it. */
export function placeOnLeg(car, axis, line, dir, along) {
  const lane = axis === 'v' ? (dir > 0 ? -ROAD.lane : ROAD.lane) : dir > 0 ? ROAD.lane : -ROAD.lane;
  car.leg = { axis, line, dir };
  car.along = along;
  car.lane = lane;
  car.angle = legHeading(axis, dir);
  if (axis === 'v') {
    car.x = line + lane;
    car.y = along;
  } else {
    car.x = along;
    car.y = line + lane;
  }
  car.speed = car.cruise;
}

/** The intersections on a leg ahead of the car, nearest first. */
function intersectionsAhead(car) {
  const { axis, line, dir } = car.leg;
  const cross = axis === 'v' ? ROAD.horizontals : ROAD.verticals;
  const ahead = [];
  for (const c of cross) {
    const d = (c - car.along) * dir;
    if (d > 0) ahead.push({ coord: c, dist: d });
  }
  ahead.sort((a, b) => a.dist - b.dist);
  return ahead;
}

function turnOptions(car, at) {
  // Straight, left and right from the leg the car is on, at intersection `at`.
  const { axis, line, dir } = car.leg;
  const options = [];
  if (axis === 'v') {
    options.push({ kind: 'straight', leg: { axis: 'v', line, dir } });
    options.push({ kind: 'left', leg: { axis: 'h', line: at, dir: dir > 0 ? 1 : -1 } });
    options.push({ kind: 'right', leg: { axis: 'h', line: at, dir: dir > 0 ? -1 : 1 } });
  } else {
    options.push({ kind: 'straight', leg: { axis: 'h', line, dir } });
    options.push({ kind: 'left', leg: { axis: 'v', line: at, dir: dir > 0 ? -1 : 1 } });
    options.push({ kind: 'right', leg: { axis: 'v', line: at, dir: dir > 0 ? 1 : -1 } });
  }
  return options;
}

/** Pick the next leg at an intersection. `toward` is an optional {x, y} target. */
export function chooseLeg(random, car, at, toward) {
  const options = turnOptions(car, at);
  if (toward) {
    // The leg whose heading points most toward the target.
    let best = options[0];
    let bestScore = -Infinity;
    for (const option of options) {
      const heading = legHeading(option.leg.axis, option.leg.dir);
      const want = Math.atan2(toward.y - car.y, toward.x - car.x);
      const score = Math.cos(angleDelta(heading, want));
      if (score > bestScore) {
        bestScore = score;
        best = option;
      }
    }
    return best.leg;
  }
  const roll = random();
  const pick = roll < 0.62 ? options[0] : roll < 0.81 ? options[1] : options[2];
  return pick.leg;
}

function applyLeg(car, leg) {
  // The car's position on the new leg starts at the intersection, whose
  // coordinate along the new road is the old leg's line.
  const along = car.leg.line;
  car.leg = leg;
  car.along = along;
  const lane = leg.axis === 'v' ? (leg.dir > 0 ? -ROAD.lane : ROAD.lane) : leg.dir > 0 ? ROAD.lane : -ROAD.lane;
  car.targetLane = lane;
}

function stepLeg(car, dt, random, toward, cars) {
  const { axis, line, dir } = car.leg;
  const maxAlong = axis === 'v' ? ROAD.beachTop : WORLD.width;
  // Slow for a car ahead on the same leg.
  let targetSpeed = car.cruise;
  if (cars) {
    for (const other of cars) {
      if (other === car || other.wrecked || !other.leg) continue;
      if (other.leg.axis !== axis || other.leg.line !== line || other.leg.dir !== dir) continue;
      const gap = (other.along - car.along) * dir;
      if (gap > 0 && gap < 78) {
        targetSpeed = Math.min(targetSpeed, Math.max(0, other.speed - 12));
        break;
      }
    }
    // And slow for the player's car when it is right in front of us: the
    // player drives free, with no leg, so check it by position instead.
    for (const other of cars) {
      if (other.driver !== 'player' || other.wrecked) continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const ahead = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
      const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
      if (ahead > 0 && ahead < 85 && side < 26) {
        targetSpeed = Math.min(targetSpeed, Math.max(0, Math.abs(other.speed) - 12));
        break;
      }
    }
  }
  const ahead = intersectionsAhead(car);
  if (ahead.length > 0 && ahead[0].dist < 30 && ahead[0].coord !== car.lastTurnAt) {
    // At an intersection: decide the next leg once, at the crossing.
    car.lastTurnAt = ahead[0].coord;
    const next = chooseLeg(random, car, ahead[0].coord, toward);
    applyLeg(car, next);
    return;
  }
  // End of the road: turn around.
  if ((dir > 0 && car.along >= maxAlong - 46) || (dir < 0 && car.along <= 46)) {
    car.leg = { axis, line, dir: -dir };
    car.targetLane = axis === 'v' ? (dir < 0 ? -ROAD.lane : ROAD.lane) : dir < 0 ? ROAD.lane : -ROAD.lane;
    return;
  }
  car.speed = approach(car.speed, targetSpeed, 260 * dt);
  car.along += dir * car.speed * dt;
  // Smooth the heading and the lane offset after a turn.
  const targetLane = car.targetLane !== undefined ? car.targetLane : car.lane;
  car.lane = approach(car.lane, targetLane, 130 * dt);
  const heading = legHeading(axis, dir);
  car.angle += angleDelta(car.angle, heading) * Math.min(1, 6 * dt);
  if (axis === 'v') {
    car.x = line + car.lane;
    car.y = car.along;
  } else {
    car.x = car.along;
    car.y = line + car.lane;
  }
}

/** Advance one traffic or police car along the roads. */
export function stepTrafficCar(car, dt, random, toward, cars) {
  if (car.wrecked || !car.leg) return;
  stepLeg(car, dt, random, toward, cars);
}

/**
 * Free driving physics for the player's car (and anything driven by the
 * autopilot): throttle, steering, braking, building collision and skids.
 * `drive` is { steer: -1..1, throttle: -1..1, brake: boolean }.
 */
export function driveCar(car, dt, drive, city, fx) {
  if (car.wrecked) return;
  const steer = clamp(drive.steer, -1, 1);
  const throttle = clamp(drive.throttle, -1, 1);
  const forward = car.speed >= 0 ? 1 : -1;
  if (throttle > 0) car.speed += car.accel * throttle * dt;
  else if (throttle < 0) {
    if (car.speed > 8) car.speed -= CAR.brake * dt;
    else car.speed = Math.max(-CAR.reverseMax, car.speed + car.accel * 0.55 * dt);
  } else {
    car.speed = approach(car.speed, 0, 190 * dt);
  }
  if (drive.brake) car.speed = approach(car.speed, 0, CAR.brake * dt);
  car.speed = clamp(car.speed, -CAR.reverseMax, car.maxSpeed);
  const turnRate = CAR.grip * clamp(Math.abs(car.speed) / 240, 0.25, 1);
  car.angle += steer * turnRate * forward * dt;
  if (Math.abs(steer) > 0.7 && Math.abs(car.speed) > 260) car.skid = Math.min(1, car.skid + dt * 3);
  else car.skid = Math.max(0, car.skid - dt * 2);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  car.x = clamp(nx, 20, WORLD.width - 20);
  car.y = clamp(ny, 20, WORLD.height - 20);
  // Building collision: check the nose, the tail and the middle.
  const points = [
    { x: car.x + Math.cos(car.angle) * (car.length / 2), y: car.y + Math.sin(car.angle) * (car.length / 2) },
    { x: car.x - Math.cos(car.angle) * (car.length / 2), y: car.y - Math.sin(car.angle) * (car.length / 2) },
    { x: car.x, y: car.y },
  ];
  let crashed = false;
  for (const p of points) {
    if (hitBuilding(city, p.x, p.y, car.width / 2 - 2)) {
      crashed = true;
      break;
    }
  }
  // The ocean stops cars at the shoreline (the pier is not water).
  if (!crashed && isWater(city, car.x, car.y)) crashed = true;
  if (crashed) {
    const impact = Math.abs(car.speed);
    car.x -= Math.cos(car.angle) * car.speed * dt;
    car.y -= Math.sin(car.angle) * car.speed * dt;
    car.speed *= -0.25;
    if (impact > 180) {
      car.health -= impact * 0.05;
      if (fx) fx.push({ type: 'crash', x: car.x, y: car.y, hard: impact > 320 });
    }
  }
}

/** Push overlapping cars apart and trade a little speed and damage. */
export function separateCars(cars, fx) {
  for (let i = 0; i < cars.length; i += 1) {
    const a = cars[i];
    if (a.wrecked) continue;
    for (let j = i + 1; j < cars.length; j += 1) {
      const b = cars[j];
      if (b.wrecked) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const min = 40;
      if (d === 0 || d >= min) continue;
      const push = (min - d) / 2;
      const nx = dx / d;
      const ny = dy / d;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      const closing = Math.abs(a.speed - b.speed);
      if (closing > 120) {
        a.health -= closing * 0.02;
        b.health -= closing * 0.02;
        if (fx) fx.push({ type: 'crash', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, hard: closing > 300 });
      }
      const tmp = a.speed;
      a.speed = b.speed * 0.6;
      b.speed = tmp * 0.6;
    }
  }
}

/** Damage a car; returns true when it becomes a wreck. */
export function damageCar(car, amount, fx) {
  if (car.wrecked) return true;
  car.health -= amount;
  if (car.health <= 0) {
    car.health = 0;
    car.wrecked = true;
    car.speed = 0;
    car.smoke = 1;
    if (fx) fx.push({ type: 'explosion', x: car.x, y: car.y });
    return true;
  }
  if (car.health < 40) car.smoke = Math.max(car.smoke, 0.5);
  return false;
}

// --- Waypoint autopilot ----------------------------------------------------

/** Manhattan waypoints from (x, y) to (tx, ty) along the road grid. */
export function routeWaypoints(x, y, tx, ty) {
  const nearestV = (v) => ROAD.verticals.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
  const nearestH = (h) => ROAD.horizontals.reduce((a, b) => (Math.abs(b - h) < Math.abs(a - h) ? b : a));
  const vx = nearestV(x);
  const hx = nearestH(y);
  const tvx = nearestV(tx);
  const thx = nearestH(ty);
  const onVertical = Math.abs(x - vx) <= Math.abs(y - hx);
  if (onVertical) return [{ x: vx, y: thx }, { x: tvx, y: thx }, { x: tx, y: ty }];
  return [{ x: tvx, y: hx }, { x: tvx, y: thx }, { x: tx, y: ty }];
}

/**
 * Steer a free-driving car toward a target through the road grid. Returns
 * the { steer, throttle, brake } the caller feeds to driveCar, and the
 * remaining distance to the target.
 */
export function autopilotDrive(car, target, waypoints) {
  let wp = waypoints[0];
  while (waypoints.length > 1 && distance(car.x, car.y, wp.x, wp.y) < 46) {
    waypoints.shift();
    wp = waypoints[0];
  }
  const want = Math.atan2(wp.y - car.y, wp.x - car.x);
  const delta = angleDelta(car.angle, want);
  const steer = clamp(delta * 2.2, -1, 1);
  const throttle = Math.abs(delta) > 1.1 ? 0.35 : 1;
  return { steer, throttle, brake: false, arrived: waypoints.length === 1 && distance(car.x, car.y, wp.x, wp.y) < 40 };
}

/** Spawn `count` moving traffic cars on random roads. */
export function spawnTraffic(random, count) {
  const cars = [];
  const kinds = ['sedan', 'sedan', 'sport', 'taxi', 'van', 'truck', 'sedan'];
  for (let i = 0; i < count; i += 1) {
    const axis = random.chance(0.5) ? 'v' : 'h';
    const line = random.pick(axis === 'v' ? ROAD.verticals : ROAD.horizontals);
    const dir = random.pick([-1, 1]);
    const along = random.range(80, (axis === 'v' ? ROAD.beachTop : WORLD.width) - 80);
    const car = createCar(random, random.pick(kinds), 0, 0, 0, 'traffic');
    placeOnLeg(car, axis, line, dir, along);
    cars.push(car);
  }
  return cars;
}

/** Spawn `count` parked cars at road edges. */
export function spawnParked(random, count, city) {
  const cars = [];
  const kinds = ['sedan', 'sedan', 'sport', 'van', 'sedan', 'taxi'];
  let placed = 0;
  let guard = 0;
  while (placed < count && guard < count * 12) {
    guard += 1;
    const axis = random.chance(0.5) ? 'v' : 'h';
    const line = random.pick(axis === 'v' ? ROAD.verticals : ROAD.horizontals);
    const dir = random.pick([-1, 1]);
    const along = random.range(100, (axis === 'v' ? ROAD.beachTop : WORLD.width) - 100);
    const side = random.pick([-1, 1]) * (ROAD.width / 2 - 9);
    const x = axis === 'v' ? line + side : along;
    const y = axis === 'v' ? along : line + side;
    if (hitBuilding(city, x, y, 24)) continue;
    const angle = axis === 'v' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : dir > 0 ? 0 : Math.PI;
    const car = createCar(random, random.pick(kinds), x, y, angle, 'parked');
    cars.push(car);
    placed += 1;
  }
  return cars;
}
