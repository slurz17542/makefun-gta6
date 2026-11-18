// The world: one state object and one step that advances it. Traffic, peds,
// police, missions, particles and the camera all move here; the renderer and
// the audio only read what is here. A step returns what happened that the
// screens need to know about (wasted, busted); everything else travels as
// fx events the main loop turns into sound.
import { ROAD, SPAWN, WORLD } from './config.js';
import { createRandom, clamp, distance } from './random.js';
import { createCity, PLACES } from './city.js';
import { createPlayer, hurtPlayer, stepPlayer } from './player.js';
import { createCar, separateCars, spawnParked, spawnTraffic, stepTrafficCar } from './vehicles.js';
import { createPed, knockDown, scarePeds, spawnPedestrians, stepPedestrians, sweepDown } from './pedestrians.js';
import { addCrime, createPolice, stepPolice } from './police.js';
import { createMissions, objectiveText, startMission, stepMissions } from './missions.js';
import { spawnPickups } from './player.js';

export function createWorld(seed, save) {
  const random = createRandom(seed);
  const city = createCity(random);
  const state = {
    seed,
    random,
    city,
    time: 0,
    cash: save && save.cash ? save.cash : 0,
    player: createPlayer(PLACES.garage.x, PLACES.garage.y + 40),
    cars: [],
    peds: [],
    particles: [],
    pickups: [],
    police: createPolice(),
    missions: createMissions(),
    camera: { x: PLACES.garage.x, y: PLACES.garage.y },
    fx: [],
    stats: { distance: 0, carsStolen: 0, pedsHit: 0, missionsDone: 0, shotsFired: 0, timeDriven: 0 },
    attract: false,
    attractT: 0,
  };
  state.cars = [...spawnTraffic(random, SPAWN.traffic), ...spawnParked(random, SPAWN.parked, city)];
  state.peds = spawnPedestrians(random, city, SPAWN.pedestrians);
  state.pickups = spawnPickups(random, city, SPAWN.pickups);
  if (save && save.missionIndex) state.missions.index = Math.min(save.missionIndex, 6);
  // A starter car for the first mission's neighbourhood, parked on the road
  // outside the garage and facing along it, so the player is never stuck
  // looking for one — and never starts by driving into a building wall.
  const starter = createCar(random, 'sedan', ROAD.verticals[2], PLACES.garage.y + 30, Math.PI / 2, 'parked');
  state.cars.push(starter);
  state.player.car = null;

  function reset() {
    // Rebuild from the same seed, copying the fresh inner state into this
    // object so the step closure keeps working on it.
    const fresh = createWorld(seed, { cash: 0, missionIndex: 0 });
    for (const key of Object.keys(fresh.state)) state[key] = fresh.state[key];
  }

  function step(dt, input, aim) {
    state.time += dt;
    const player = state.player;
    const prevX = player.x;
    const prevY = player.y;

    if (state.attract) {
      // The title screen's living backdrop: traffic and pedestrians move,
      // nothing can happen to anyone.
      state.attractT += dt;
      for (const car of state.cars) if (car.driver === 'traffic') stepTrafficCar(car, dt, random, null, state.cars);
      stepPedestrians(state.peds, dt, random);
      stepParticles(dt);
      const cx = 1600 + Math.sin(state.attractT * 0.05) * 700;
      const cy = 1200 + Math.cos(state.attractT * 0.04) * 400;
      state.camera.x += (cx - state.camera.x) * Math.min(1, dt * 0.8);
      state.camera.y += (cy - state.camera.y) * Math.min(1, dt * 0.8);
      return { wasted: false, busted: false };
    }

    stepPlayer(state, dt, input, aim);
    state.stats.distance += distance(prevX, prevY, player.x, player.y);

    // Traffic and police.
    for (const car of state.cars) {
      if (car.driver === 'traffic') stepTrafficCar(car, dt, random, null, state.cars);
    }
    const busted = stepPolice(state.police, dt, random, player, state.cars, state.fx);
    // Police cars that left when the heat died are removed.
    for (let i = state.cars.length - 1; i >= 0; i -= 1) {
      const car = state.cars[i];
      if (car.driver === 'police' && car.leaving && state.police.stars === 0) state.cars.splice(i, 1);
    }
    // Wrecks smoke, then are towed away.
    for (let i = state.cars.length - 1; i >= 0; i -= 1) {
      const car = state.cars[i];
      if (!car.wrecked) continue;
      car.smoke = Math.max(0, car.smoke - dt * 0.03);
      if (random() < dt * 8) {
        state.particles.push({ kind: 'smoke', x: car.x, y: car.y, life: 1.4, max: 1.4 });
      }
      car.wreckAge = (car.wreckAge || 0) + dt;
      if (car.wreckAge > 30 && car !== state.missions.van) state.cars.splice(i, 1);
    }
    if (state.missions.van && state.missions.van.wrecked && state.missions.active) {
      state.missions.active = false;
      state.missions.failed = true;
      state.missions.banner = { title: 'Mission Failed', text: "The van is wrecked. Venn will want words.", giver: 'Rico' };
      state.missions.bannerTimer = 4;
    }

    // Pedestrians.
    stepPedestrians(state.peds, dt, random);
    sweepDown(state.peds);
    if (state.peds.length < 22) {
      const ped = createPed(random, state.city);
      if (distance(ped.x, ped.y, player.x, player.y) > 500) state.peds.push(ped);
    }

    // Cars hitting pedestrians. Only the player's car (and a police car) can
    // run someone down; the traffic keeps to its lanes. A crime counts only
    // when the player's car does it and someone sees it.
    for (const car of state.cars) {
      if (car.wrecked || Math.abs(car.speed) < 60) continue;
      if (car.driver !== 'player' && car.driver !== 'police') continue;
      for (const ped of state.peds) {
        if (ped.state !== 'walk' && ped.state !== 'flee') continue;
        if (distance(car.x, car.y, ped.x, ped.y) < 26) {
          knockDown(ped, state.fx);
          state.stats.pedsHit += 1;
          if (car.driver === 'player') {
            const seen = state.cars.some((c) => c.driver === 'police' && distance(c.x, c.y, car.x, car.y) < 700)
              || state.peds.some((p) => p.state === 'walk' && distance(p.x, p.y, car.x, car.y) < 260);
            if (seen) addCrime(state.police, 1);
          }
          scarePeds(state.peds, ped.x, ped.y, 300);
        }
      }
    }

    // Cars hitting the player on foot.
    if (!player.car) {
      for (const car of state.cars) {
        if (car.wrecked || Math.abs(car.speed) < 40) continue;
        if (distance(car.x, car.y, player.x, player.y) < 26) {
          const away = Math.atan2(player.y - car.y, player.x - car.x);
          player.x += Math.cos(away) * 26;
          player.y += Math.sin(away) * 26;
          hurtPlayer(state, 12);
        }
      }
    }

    // Rivals shoot back.
    for (const ped of state.peds) {
      if (!ped.rival || ped.state === 'down') continue;
      ped.shootCooldown -= dt;
      const d = distance(ped.x, ped.y, player.x, player.y);
      if (d < 380 && ped.shootCooldown <= 0) {
        ped.shootCooldown = 1.3;
        const angle = Math.atan2(player.y - ped.y, player.x - ped.x);
        state.particles.push({ kind: 'tracer', x: ped.x, y: ped.y, x2: player.x, y2: player.y, life: 0.09, max: 0.09 });
        state.fx.push({ type: 'shot', x: ped.x, y: ped.y });
        if (d < 340) hurtPlayer(state, 8);
      }
    }

    separateCars(state.cars, state.fx);
    stepMissions(state, dt);
    stepParticles(dt);
    stepSkids(dt);

    // Camera follows the player, clamped inside the city.
    const tx = clamp(player.x, 640, WORLD.width - 640);
    const ty = clamp(player.y, 360, WORLD.height - 360);
    state.camera.x += (tx - state.camera.x) * Math.min(1, dt * 5);
    state.camera.y += (ty - state.camera.y) * Math.min(1, dt * 5);

    return { wasted: player.health <= 0, busted: busted === 'busted' };
  }

  function stepParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const p = state.particles[i];
      p.life -= dt;
      if (p.life <= 0) state.particles.splice(i, 1);
    }
  }

  function stepSkids(dt) {
    // Skid marks from the player's car and the police, fading over seconds.
    for (const car of state.cars) {
      if (car.skid > 0.5 && Math.abs(car.speed) > 200) {
        state.skidTimer = (state.skidTimer || 0) + dt;
        if (state.skidTimer > 0.06) {
          state.skidTimer = 0;
          const back = car.length / 2 - 6;
          const bx = car.x - Math.cos(car.angle) * back;
          const by = car.y - Math.sin(car.angle) * back;
          state.particles.push({ kind: 'skid', x: bx, y: by, angle: car.angle, life: 3, max: 3 });
        }
      }
    }
  }

  return { state, reset, step, startMission: () => startMission(state), objectiveText: () => objectiveText(state) };
}
