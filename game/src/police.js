// The wanted level and the Solmar PD. Crimes add stars; the police send
// cars that chase the player along the roads, ram the player's car, and bust
// the player on foot when they sit on them long enough. Out of sight, the
// heat cools: a star fades every few seconds once no police car has seen the
// player for a while.
import { ROAD, WANTED, WORLD } from './config.js';
import { distance } from './random.js';
import { createCar, placeOnLeg, stepTrafficCar } from './vehicles.js';
import { PLACES } from './city.js';

export function createPolice() {
  return {
    stars: 0,
    heat: 0,
    decayTimer: 0,
    decayAcc: 0,
    bustTimer: 0,
    spawnTimer: 0,
    seen: false,
  };
}

/**
 * A crime was committed: it adds heat, and a full point of heat becomes a
 * star. Small crimes (a single gunshot) only count once they add up.
 */
export function addCrime(police, amount) {
  police.heat += amount;
  while (police.heat >= 1 && police.stars < WANTED.maxStars) {
    police.heat -= 1;
    police.stars += 1;
  }
  if (police.stars >= WANTED.maxStars) police.heat = Math.min(police.heat, 0.99);
  police.decayTimer = 0;
}

export function clearWanted(police) {
  police.stars = 0;
  police.heat = 0;
  police.decayTimer = 0;
  police.decayAcc = 0;
  police.bustTimer = 0;
  police.spawnTimer = 0;
  police.seen = false;
}

/** How many police cars the current heat calls for. */
export function copsWanted(police) {
  if (police.stars === 0) return 0;
  return Math.min(WANTED.maxCops, 1 + police.stars);
}

/** A patrol car's cruising speed at the current heat. */
export function copCruiseSpeed(police) {
  return WANTED.copCruise + WANTED.copSpeedPerStar * police.stars;
}

function spawnCop(random, cars, player, police) {
  // A road point near the player, but not on top of them.
  const axis = random.chance(0.5) ? 'v' : 'h';
  const line = random.pick(axis === 'v' ? ROAD.verticals : ROAD.horizontals);
  const along = random.range(80, (axis === 'v' ? ROAD.beachTop : WORLD.width) - 80);
  const x = axis === 'v' ? line : along;
  const y = axis === 'v' ? along : line;
  if (distance(x, y, player.x, player.y) < 420) return null;
  const cop = createCar(random, 'cop', 0, 0, 0, 'police');
  placeOnLeg(cop, axis, line, random.pick([-1, 1]), along);
  cop.cruise = copCruiseSpeed(police);
  cars.push(cop);
  return cop;
}

/**
 * Advance the police one step. Returns 'busted' when a police car has sat
 * on the player on foot long enough to arrest them.
 */
export function stepPolice(police, dt, random, player, cars, fx) {
  const wanted = copsWanted(police);
  const cops = cars.filter((car) => car.driver === 'police' && !car.wrecked);
  // Spawn more cars while the heat calls for them.
  police.spawnTimer -= dt;
  if (cops.length < wanted && police.spawnTimer <= 0) {
    const cop = spawnCop(random, cars, player, police);
    if (cop) police.spawnTimer = 1.2;
    else police.spawnTimer = 0.4;
  }
  // Drive the chase: every cop follows the roads toward the player, and a
  // cop that gets close puts its foot down to ram them off the road.
  const target = { x: player.x, y: player.y };
  for (const cop of cops) {
    const d = distance(cop.x, cop.y, player.x, player.y);
    cop.cruise = copCruiseSpeed(police) + (d < WANTED.pursuitRange ? WANTED.pursuitBoost : 0);
    stepTrafficCar(cop, dt, random, target, cars);
  }
  // Seen? Any live cop within sight of the player.
  police.seen = cops.some((cop) => distance(cop.x, cop.y, player.x, player.y) < 620);
  if (police.seen) police.decayTimer = 0;
  else police.decayTimer += dt;
  if (police.stars > 0 && police.decayTimer > WANTED.decayDelay) {
    police.decayTimer = WANTED.decayDelay;
    police.decayAcc = (police.decayAcc || 0) + dt;
    if (police.decayAcc >= WANTED.decayEvery) {
      police.decayAcc = 0;
      police.stars -= 1;
      if (fx) fx.push({ type: 'heatDown', x: player.x, y: player.y });
    }
  } else {
    police.decayAcc = 0;
  }
  // Busted: a cop sitting on a slow player on foot.
  const playerSpeed = player.car ? Math.abs(player.car.speed) : 0;
  const onFoot = !player.car;
  let pressed = false;
  for (const cop of cops) {
    if (distance(cop.x, cop.y, player.x, player.y) < 64 && (onFoot || playerSpeed < 60)) {
      pressed = true;
      break;
    }
  }
  if (pressed && police.stars > 0) {
    police.bustTimer += dt;
    if (police.bustTimer >= WANTED.bustSeconds) {
      police.bustTimer = 0;
      return 'busted';
    }
  } else {
    police.bustTimer = Math.max(0, police.bustTimer - dt * 2);
  }
  // Heat gone: the cars drive off (they are removed by the world).
  if (police.stars === 0 && cops.length > 0) {
    for (const cop of cops) {
      cop.leaving = true;
    }
  }
  return null;
}

/** The police station, where a busted player wakes up. */
export function policeStationPoint() {
  return { x: PLACES.policeStation.x, y: PLACES.policeStation.y };
}
