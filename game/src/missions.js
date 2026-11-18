// The story and the side work. Mara Vega, a driver-for-hire in Solmar, owes
// money; her fixer Rico feeds her jobs, and Dario Venn's syndicate owns the
// streets she drives on. Seven missions run in order, each a list of steps
// the world checks every tick; between them the player can pick up fares, a
// pedestrian with a marker who pays to be driven across town.
import { PLACES } from './city.js';
import { addCrime } from './police.js';
import { createCar } from './vehicles.js';
import { createPed } from './pedestrians.js';
import { distance } from './random.js';

export const MISSION_DEFS = [
  {
    id: 'first-wheels',
    title: 'First Wheels',
    giver: 'Rico',
    reward: 150,
    briefing: "Rico needs a driver, and you need the money. Steal a car — any car — and bring it to my garage.",
    steps: [
      { type: 'enterCar', text: 'Steal a car — walk up to one and press E' },
      { type: 'goto', place: 'garage', text: "Drive to Rico's Garage" },
    ],
  },
  {
    id: 'package-run',
    title: 'Package Run',
    giver: 'Rico',
    reward: 300,
    briefing: 'A package is waiting at the Docks. Pick it up and get it to the Palmera Motel. Ninety seconds. No questions.',
    steps: [
      { type: 'goto', place: 'docks', text: 'Pick up the package at the Docks' },
      { type: 'deliver', place: 'motel', timer: 90, text: 'Deliver the package to the Palmera Motel' },
    ],
  },
  {
    id: 'lose-the-heat',
    title: 'Lose the Heat',
    giver: 'Rico',
    reward: 250,
    briefing: 'The drop was watched. The PD is all over you — break line of sight and let the heat cool off.',
    steps: [{ type: 'loseHeat', text: 'Lose the cops — stay out of sight until the stars fade' }],
    onStart(state) {
      addCrime(state.police, 2);
    },
  },
  {
    id: 'getaway',
    title: 'Getaway Driver',
    giver: 'Rico',
    reward: 400,
    briefing: 'One of my crew is stuck at Plaza Mayor with the PD closing in. Pick them up and get them to the Hideout.',
    steps: [
      { type: 'pickupPed', place: 'plaza', text: 'Pick up the crew member at Plaza Mayor' },
      { type: 'deliver', place: 'hideout', text: 'Drive them to the Hideout' },
    ],
    onStart(state) {
      const ped = createPed(state.random, state.city);
      ped.x = PLACES.plaza.x;
      ped.y = PLACES.plaza.y - 40;
      ped.crew = true;
      state.peds.push(ped);
      state.missions.crewPed = ped;
      addCrime(state.police, 2);
    },
  },
  {
    id: 'turf-war',
    title: 'Turf War',
    giver: 'Rico',
    reward: 500,
    briefing: "Venn's crew is holding Palmera Park like they own it. Take them down — all four — and the park is ours.",
    steps: [{ type: 'shoot', count: 4, place: 'park', text: "Take down Venn's crew at Palmera Park (4 left)" }],
    onStart(state) {
      const rivals = [];
      for (let i = 0; i < 4; i += 1) {
        const ped = createPed(state.random, state.city);
        ped.x = PLACES.park.x - 60 + (i % 2) * 120;
        ped.y = PLACES.park.y - 40 + Math.floor(i / 2) * 80;
        ped.rival = true;
        ped.health = 100;
        ped.shootCooldown = 1 + i * 0.3;
        rivals.push(ped);
        state.peds.push(ped);
      }
      state.missions.rivals = rivals;
    },
  },
  {
    id: 'big-score',
    title: 'The Big Score',
    giver: 'Rico',
    reward: 1000,
    briefing: "Venn's armored van is parked outside Venn Tower, full of his week's take. Steal it, bring it here, and we're square.",
    steps: [
      { type: 'stealVan', place: 'vennTower', text: "Steal Venn's armored van" },
      { type: 'deliver', place: 'garage', text: "Bring the van to Rico's Garage" },
    ],
    onStart(state) {
      const van = createCar(state.random, 'van', PLACES.vennTower.x + 40, PLACES.vennTower.y + 60, Math.PI / 2, 'parked');
      van.color = '#3a3a42';
      van.armored = true;
      state.cars.push(van);
      state.missions.van = van;
    },
  },
  {
    id: 'night-run',
    title: 'Night Run',
    giver: 'Rico',
    reward: 600,
    briefing: "One last run before the sun comes up. Three drops, three deadlines — the Docks, the Motel, then the Hideout. Don't be late.",
    steps: [
      { type: 'goto', place: 'docks', text: 'Pick up the night cargo at the Docks' },
      { type: 'deliver', place: 'motel', timer: 75, text: 'Drop it at the Palmera Motel' },
      { type: 'deliver', place: 'hideout', timer: 90, text: 'Last drop: the Hideout' },
    ],
    onStart(state) {
      addCrime(state.police, 1);
    },
  },
];

export function createMissions() {
  return {
    index: 0,
    step: 0,
    active: false,
    failed: false,
    timer: 0,
    banner: null,
    bannerTimer: 0,
    storyDone: false,
    crewPed: null,
    rivals: [],
    van: null,
    fare: { phase: 'none', ped: null, dest: null, amount: 0, timer: 18 },
  };
}

export function currentMission(missions) {
  if (missions.index >= MISSION_DEFS.length) return null;
  return MISSION_DEFS[missions.index];
}

export function currentStep(missions) {
  const mission = currentMission(missions);
  if (!mission || !missions.active) return null;
  return mission.steps[missions.step] || null;
}

export function startMission(state) {
  const missions = state.missions;
  const mission = currentMission(missions);
  if (!mission) return;
  // Clean up anything a previous attempt of this mission left behind, so a
  // retry never spawns a second crew member, rival crew or van.
  if (missions.crewPed) {
    const i = state.peds.indexOf(missions.crewPed);
    if (i !== -1) state.peds.splice(i, 1);
    missions.crewPed = null;
  }
  for (const rival of missions.rivals) {
    const i = state.peds.indexOf(rival);
    if (i !== -1) state.peds.splice(i, 1);
  }
  missions.rivals = [];
  if (missions.van) {
    const i = state.cars.indexOf(missions.van);
    if (i !== -1) state.cars.splice(i, 1);
    missions.van = null;
  }
  missions.active = true;
  missions.failed = false;
  missions.step = 0;
  missions.timer = 0;
  missions.banner = { title: mission.title, text: mission.briefing, giver: mission.giver };
  missions.bannerTimer = 5;
  if (mission.onStart) mission.onStart(state);
}

function completeMission(state) {
  const missions = state.missions;
  const mission = currentMission(missions);
  state.cash += mission.reward;
  state.stats.missionsDone += 1;
  missions.active = false;
  missions.index += 1;
  missions.banner = { title: 'Mission Complete', text: `${mission.title} — $${mission.reward}`, giver: 'Rico' };
  missions.bannerTimer = 4;
  state.fx.push({ type: 'missionDone', x: state.player.x, y: state.player.y });
  if (missions.index >= MISSION_DEFS.length) {
    missions.storyDone = true;
    missions.banner = { title: 'Story Complete', text: 'The Venn take is yours. Solmar is yours now — free roam.', giver: 'Rico' };
    missions.bannerTimer = 6;
  }
}

function failMission(state, reason) {
  const missions = state.missions;
  missions.active = false;
  missions.failed = true;
  missions.banner = { title: 'Mission Failed', text: reason, giver: 'Rico' };
  missions.bannerTimer = 4;
  state.fx.push({ type: 'missionFailed', x: state.player.x, y: state.player.y });
}

/** Where the HUD arrow and the minimap should point, or null. */
export function missionMarker(state) {
  const missions = state.missions;
  if (missions.active) {
    const step = currentStep(missions);
    if (!step) return null;
    if (step.place) {
      const place = PLACES[step.place];
      return { x: place.x, y: place.y, label: place.label };
    }
    return null;
  }
  if (missions.fare.phase === 'wait' && missions.fare.ped) {
    return { x: missions.fare.ped.x, y: missions.fare.ped.y, label: 'Fare' };
  }
  if (missions.fare.phase === 'ride' && missions.fare.dest) {
    return { x: missions.fare.dest.x, y: missions.fare.dest.y, label: missions.fare.dest.label };
  }
  return null;
}

function stepFare(state, dt) {
  const missions = state.missions;
  const fare = missions.fare;
  const player = state.player;
  if (fare.phase === 'none') {
    fare.timer -= dt;
    if (fare.timer <= 0 && player.car && !missions.active) {
      // A pedestrian nearby flags the player down.
      const near = state.peds.filter((p) => p.state === 'walk' && !p.fare && !p.rival && distance(p.x, p.y, player.x, player.y) < 700);
      if (near.length > 0) {
        const chosen = near[0];
        chosen.fare = true;
        fare.ped = chosen;
        fare.phase = 'wait';
      } else {
        fare.timer = 6;
      }
    }
    return;
  }
  if (fare.phase === 'wait') {
    if (!fare.ped || fare.ped.state !== 'walk') {
      fare.phase = 'none';
      fare.ped = null;
      fare.timer = 15;
      return;
    }
    // Pull up in a car, slow, and they get in.
    if (player.car && Math.abs(player.car.speed) < 80 && distance(player.x, player.y, fare.ped.x, fare.ped.y) < 78) {
      const dests = Object.keys(PLACES).filter((k) => k !== 'docks' && k !== 'beach');
      const key = dests[Math.floor(state.random() * dests.length)];
      fare.dest = PLACES[key];
      fare.amount = 40 + Math.floor(distance(fare.ped.x, fare.ped.y, fare.dest.x, fare.dest.y) / 40);
      fare.phase = 'ride';
      state.peds.splice(state.peds.indexOf(fare.ped), 1);
      fare.ped = null;
      state.fx.push({ type: 'pickup', x: player.x, y: player.y });
    }
    return;
  }
  // Riding: deliver them to the destination.
  if (fare.phase === 'ride') {
    if (!player.car || distance(player.x, player.y, fare.dest.x, fare.dest.y) > 900) {
      fare.phase = 'none';
      fare.dest = null;
      fare.timer = 15;
      return;
    }
    if (distance(player.x, player.y, fare.dest.x, fare.dest.y) < 85) {
      state.cash += fare.amount;
      state.fx.push({ type: 'cash', x: player.x, y: player.y });
      missions.banner = { title: 'Fare Complete', text: `+$${fare.amount}`, giver: '' };
      missions.bannerTimer = 2.5;
      fare.phase = 'none';
      fare.dest = null;
      fare.timer = 20;
    }
  }
}

/** Advance the story and the fares one step. */
export function stepMissions(state, dt) {
  const missions = state.missions;
  const player = state.player;
  if (missions.bannerTimer > 0) missions.bannerTimer -= dt;
  stepFare(state, dt);
  if (!missions.active) return;
  const mission = currentMission(missions);
  const step = currentStep(missions);
  if (!step) return;
  if (step.timer) {
    missions.timer += dt;
    if (missions.timer > step.timer) {
      failMission(state, 'Out of time.');
      return;
    }
  }
  switch (step.type) {
    case 'enterCar': {
      if (player.car) {
        missions.step += 1;
        missions.timer = 0;
      }
      break;
    }
    case 'goto':
    case 'deliver': {
      // Reaching the marker completes the step, on foot or in a car: a
      // drive-by drop counts, the courier takes it from the window.
      const place = PLACES[step.place];
      if (distance(player.x, player.y, place.x, place.y) < 85) {
        missions.step += 1;
        missions.timer = 0;
        state.fx.push({ type: 'pickup', x: player.x, y: player.y });
      }
      break;
    }
    case 'loseHeat': {
      if (state.police.stars === 0) {
        missions.step += 1;
        missions.timer = 0;
      }
      break;
    }
    case 'pickupPed': {
      const ped = missions.crewPed;
      if (!ped || ped.state !== 'walk') {
        failMission(state, 'Your crew member is gone.');
        return;
      }
      if (player.car && Math.abs(player.car.speed) < 80 && distance(player.x, player.y, ped.x, ped.y) < 78) {
        state.peds.splice(state.peds.indexOf(ped), 1);
        missions.crewPed = null;
        missions.step += 1;
        missions.timer = 0;
        state.fx.push({ type: 'pickup', x: player.x, y: player.y });
      }
      break;
    }
    case 'shoot': {
      const left = missions.rivals.filter((r) => r.state !== 'down').length;
      if (left === 0) {
        missions.step += 1;
        missions.timer = 0;
      }
      break;
    }
    case 'stealVan': {
      if (player.car === missions.van) {
        addCrime(state.police, 3);
        missions.step += 1;
        missions.timer = 0;
        state.fx.push({ type: 'pickup', x: player.x, y: player.y });
      }
      break;
    }
    default:
      break;
  }
  if (missions.step >= mission.steps.length) completeMission(state);
}

/** The text of the current objective, for the HUD. */
export function objectiveText(state) {
  const missions = state.missions;
  if (missions.active) {
    const mission = currentMission(missions);
    const step = currentStep(missions);
    if (!mission || !step) return '';
    let text = step.text;
    if (step.type === 'shoot') {
      const left = missions.rivals.filter((r) => r.state !== 'down').length;
      text = `Take down Venn's crew at Palmera Park (${left} left)`;
    }
    if (step.timer) {
      const left = Math.max(0, Math.ceil(step.timer - missions.timer));
      text += ` — ${left}s`;
    }
    return `${mission.title}: ${text}`;
  }
  if (missions.fare.phase === 'ride') return `Fare: take them to ${missions.fare.dest.label}`;
  if (missions.fare.phase === 'wait') return 'Fare: pull up next to the waiting pedestrian';
  if (missions.index < MISSION_DEFS.length) return `Next job: ${MISSION_DEFS[missions.index].title} — drive to ${PLACES.garage.label} to start`;
  return 'Free roam — Solmar is yours';
}
