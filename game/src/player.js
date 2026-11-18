// Mara Vega on foot and behind the wheel: walking and running, stealing and
// driving cars, shooting the pistol, and picking up what the city drops.
// The module never draws; it moves the player and reports what happened.
import { PLAYER, WORLD } from './config.js';
import { clamp, distance } from './random.js';
import { hitBuilding, isWater, resolveCircle } from './city.js';
import { damageCar, driveCar } from './vehicles.js';
import { addCrime } from './police.js';
import { knockDown, scarePeds } from './pedestrians.js';
import { ACTION_ENTER } from './input.js';

export function createPlayer(x, y) {
  return {
    x,
    y,
    angle: -Math.PI / 2,
    aimAngle: -Math.PI / 2,
    health: PLAYER.health,
    ammo: PLAYER.pistolAmmo,
    car: null,
    shootCooldown: 0,
    hurtCooldown: 0,
    lastHurt: -99,
    moving: false,
    bob: 0,
  };
}

/** The nearest car the player could get into, within `maxDist`. */
export function nearestCar(state, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of state.cars) {
    if (car.wrecked) continue;
    const d = distance(state.player.x, state.player.y, car.x, car.y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

function stealCrime(state, car) {
  // Taking an occupied car is always reported. A parked car only counts when
  // someone sees it happen.
  if (car.driver === 'traffic') {
    addCrime(state.police, 1);
    return;
  }
  const seenByCop = state.cars.some((c) => c.driver === 'police' && distance(c.x, c.y, car.x, car.y) < 600);
  const seenByPed = state.peds.some((p) => p.state === 'walk' && distance(p.x, p.y, car.x, car.y) < 220);
  if (seenByCop || seenByPed) addCrime(state.police, 1);
}

export function enterCar(state, car) {
  const player = state.player;
  stealCrime(state, car);
  player.car = car;
  car.driver = 'player';
  car.speed = Math.max(car.speed, 0);
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
  state.stats.carsStolen += 1;
  state.fx.push({ type: 'enterCar', x: car.x, y: car.y });
}

export function exitCar(state) {
  const player = state.player;
  const car = player.car;
  if (!car) return;
  const fast = Math.abs(car.speed) > 200;
  const sideX = car.x - Math.sin(car.angle) * 34;
  const sideY = car.y + Math.cos(car.angle) * 34;
  const resolved = resolveCircle(state.city, sideX, sideY, PLAYER.radius);
  player.x = resolved.x;
  player.y = resolved.y;
  player.angle = car.angle;
  player.car = null;
  car.driver = 'parked';
  if (fast) {
    hurtPlayer(state, 15);
    state.fx.push({ type: 'crash', x: player.x, y: player.y, hard: false });
  }
}

/** Hurt the player; returns true when they are wasted. */
export function hurtPlayer(state, amount) {
  const player = state.player;
  if (player.hurtCooldown > 0) return false;
  player.health -= amount;
  player.hurtCooldown = 0.5;
  player.lastHurt = state.time;
  if (player.health <= 0) {
    player.health = 0;
    return true;
  }
  return false;
}

// --- Shooting --------------------------------------------------------------

/**
 * The distance along a ray from (x, y) at `angle` where it first enters a
 * building, or null when it travels the whole `range` clear. Bullets stop
 * at walls now, instead of passing straight through the city.
 */
function raycastWall(state, x, y, angle, range) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  for (let t = 8; t <= range; t += 8) {
    if (hitBuilding(state.city, x + dx * t, y + dy * t, 1)) return t;
  }
  return null;
}

/** The first thing a bullet from (x, y) along `angle` hits, within range. */
function raycast(state, x, y, angle, range) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let best = null;
  let bestT = range;
  for (const ped of state.peds) {
    if (ped.state === 'down') continue;
    const px = ped.x - x;
    const py = ped.y - y;
    const t = px * dx + py * dy;
    if (t < 0 || t > bestT) continue;
    const perp = Math.abs(px * dy - py * dx);
    if (perp < 14) {
      best = { kind: 'ped', target: ped };
      bestT = t;
    }
  }
  for (const car of state.cars) {
    if (car.wrecked || car === state.player.car) continue;
    const px = car.x - x;
    const py = car.y - y;
    const t = px * dx + py * dy;
    if (t < 0 || t > bestT) continue;
    const perp = Math.abs(px * dy - py * dx);
    if (perp < 22) {
      best = { kind: 'car', target: car };
      bestT = t;
    }
  }
  return best === null ? null : { ...best, t: bestT };
}

function fire(state, angle) {
  const player = state.player;
  if (player.ammo <= 0) {
    state.fx.push({ type: 'click', x: player.x, y: player.y });
    return;
  }
  player.ammo -= 1;
  player.shootCooldown = PLAYER.pistolCooldown;
  state.stats.shotsFired += 1;
  const ox = player.x + Math.cos(angle) * 18;
  const oy = player.y + Math.sin(angle) * 18;
  // The bullet stops at the first wall, so its range is the wall or the
  // pistol's reach, whichever comes first.
  const wallT = raycastWall(state, ox, oy, angle, PLAYER.pistolRange);
  const range = wallT === null ? PLAYER.pistolRange : wallT;
  const hit = raycast(state, ox, oy, angle, range);
  const endX = ox + Math.cos(angle) * (hit ? hit.t : range);
  const endY = oy + Math.sin(angle) * (hit ? hit.t : range);
  state.particles.push({ kind: 'tracer', x: ox, y: oy, x2: endX, y2: endY, life: 0.09, max: 0.09 });
  state.particles.push({ kind: 'flash', x: ox, y: oy, life: 0.06, max: 0.06 });
  state.fx.push({ type: 'shot', x: player.x, y: player.y });
  scarePeds(state.peds, player.x, player.y, 420);
  addCrime(state.police, 0.34);
  if (wallT !== null && !hit) {
    state.particles.push({ kind: 'hit', x: endX, y: endY, life: 0.18, max: 0.18 });
    return;
  }
  if (!hit) return;
  if (hit.kind === 'ped') {
    const ped = hit.target;
    if (ped.rival) {
      ped.health -= PLAYER.pistolDamage;
      if (ped.health <= 0) knockDown(ped, state.fx);
    } else {
      knockDown(ped, state.fx);
      addCrime(state.police, 1);
      state.stats.pedsHit += 1;
    }
    state.particles.push({ kind: 'hit', x: ped.x, y: ped.y, life: 0.25, max: 0.25 });
  } else {
    damageCar(hit.target, PLAYER.pistolDamage, state.fx);
  }
}

// --- Pickups ---------------------------------------------------------------

export function spawnPickups(random, city, count) {
  const pickups = [];
  const kinds = ['health', 'ammo', 'cash'];
  for (let i = 0; i < count; i += 1) {
    pickups.push({
      kind: random.pick(kinds),
      x: random.range(120, WORLD.width - 120),
      y: random.range(120, WORLD.height - 120),
      amount: 0,
      bob: random.range(0, Math.PI * 2),
      respawn: 0,
    });
  }
  for (const p of pickups) {
    p.amount = p.kind === 'health' ? 30 : p.kind === 'ammo' ? 24 : 25 + random.range(0, 40);
  }
  return pickups;
}

function stepPickups(state, dt) {
  const player = state.player;
  for (const pickup of state.pickups) {
    pickup.bob += dt * 3;
    if (pickup.respawn > 0) {
      pickup.respawn -= dt;
      continue;
    }
    if (distance(player.x, player.y, pickup.x, pickup.y) < 34) {
      if (pickup.kind === 'health') player.health = Math.min(PLAYER.health, player.health + pickup.amount);
      else if (pickup.kind === 'ammo') player.ammo += pickup.amount;
      else state.cash += Math.floor(pickup.amount);
      pickup.respawn = 25;
      state.fx.push({ type: pickup.kind === 'cash' ? 'cash' : 'pickup', x: pickup.x, y: pickup.y });
    }
  }
}

// --- The step --------------------------------------------------------------

/**
 * Advance the player one step. `input` is the input device, `aim` the mouse
 * position in world coordinates. Returns 'wasted' when the player dies.
 */
export function stepPlayer(state, dt, input, aim) {
  const player = state.player;
  if (player.shootCooldown > 0) player.shootCooldown -= dt;
  if (player.hurtCooldown > 0) player.hurtCooldown -= dt;
  if (!player.car && state.time - player.lastHurt > PLAYER.regenDelay && player.health < PLAYER.health) {
    player.health = Math.min(PLAYER.health, player.health + PLAYER.regenRate * dt);
  }
  stepPickups(state, dt);

  const actions = input.takeActions(ACTION_ENTER);
  if (actions & ACTION_ENTER) {
    // E: get in or out of a car.
    if (player.car) exitCar(state);
    else {
      const car = nearestCar(state, 64);
      if (car) enterCar(state, car);
    }
  }

  if (player.car) {
    const car = player.car;
    const drive = {
      steer: input.steer(),
      throttle: input.throttle(),
      brake: input.isBraking(),
    };
    driveCar(car, dt, drive, state.city, state.fx);
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    player.moving = Math.abs(car.speed) > 20;
    state.stats.timeDriven += dt;
    // Drive-by shooting.
    if (input.isMouseDown() && player.shootCooldown <= 0) {
      const angle = Math.atan2(aim.y - player.y, aim.x - player.x);
      fire(state, angle);
    }
    if (car.wrecked) {
      // The car blew up under the player: thrown clear, hurt.
      exitCar(state);
      player.health = Math.max(1, player.health - 20);
      state.fx.push({ type: 'crash', x: player.x, y: player.y, hard: true });
    }
    return null;
  }

  // On foot.
  let mx = input.moveX();
  let my = input.moveY();
  const len = Math.sqrt(mx * mx + my * my);
  if (len > 0) {
    mx /= len;
    my /= len;
  }
  const speed = input.isRunning() ? PLAYER.runSpeed : PLAYER.walkSpeed;
  player.moving = len > 0;
  if (player.moving) {
    player.angle = Math.atan2(my, mx);
    player.bob += dt * (input.isRunning() ? 13 : 9);
    const nx = player.x + mx * speed * dt;
    const ny = player.y + my * speed * dt;
    const clampedX = clamp(nx, 16, WORLD.width - 16);
    const clampedY = clamp(ny, 16, WORLD.height - 16);
    if (!isWater(state.city, clampedX, clampedY)) {
      const resolved = resolveCircle(state.city, clampedX, clampedY, PLAYER.radius);
      player.x = resolved.x;
      player.y = resolved.y;
    }
  }
  // Aim and shoot with the mouse.
  if (aim) player.aimAngle = Math.atan2(aim.y - player.y, aim.x - player.x);
  if (input.isMouseDown() && player.shootCooldown <= 0) {
    fire(state, player.aimAngle || 0);
  }
  return null;
}
