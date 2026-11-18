// Solmar's map: a grid of blocks between the roads, the beach and the ocean
// along the south, a pier, a park, a plaza, and the named places the story
// uses. Generation is seeded, so the same seed builds the same city. The
// module also answers the questions the simulation asks every step: is this
// point on a road, in a building, in the water, and where does a circle that
// hit a building end up.
import { PALETTE, ROAD, WORLD } from './config.js';
import { clamp } from './random.js';

// Blocks with something other than buildings in them, by [column, row] of
// the road grid (column i sits between verticals[i] and verticals[i+1]).
const PARKS = [[2, 1]];
const PLAZAS = [[5, 3]];

// Named places the missions drive to. x/y are the trigger points in the open.
export const PLACES = {
  garage: { x: 800, y: 2030, label: "Rico's Garage" },
  motel: { x: 2800, y: 1200, label: 'Palmera Motel' },
  hideout: { x: 400, y: 400, label: 'Hideout' },
  docks: { x: 2700, y: 2310, label: 'The Docks' },
  vennTower: { x: 2000, y: 800, label: 'Venn Tower' },
  hospital: { x: 400, y: 1200, label: 'Solmar General' },
  policeStation: { x: 2400, y: 400, label: 'Solmar PD' },
  beach: { x: 1600, y: 2310, label: 'Playa del Sol' },
  park: { x: 1200, y: 800, label: 'Palmera Park' },
  plaza: { x: 2400, y: 1600, label: 'Plaza Mayor' },
};

const PLACE_KEEP_OUT = 130;

function isPark(column, row) {
  return PARKS.some(([c, r]) => c === column && r === row);
}
function isPlaza(column, row) {
  return PLAZAS.some(([c, r]) => c === column && r === row);
}

function pointNearPlace(x, y, half) {
  for (const key of Object.keys(PLACES)) {
    const place = PLACES[key];
    if (Math.abs(x - place.x) < half && Math.abs(y - place.y) < half) return true;
  }
  return false;
}

/** The named place nearest (x, y) within `radius`, or null. */
export function nearestPlace(x, y, radius) {
  let best = null;
  let bestD = radius;
  for (const key of Object.keys(PLACES)) {
    const place = PLACES[key];
    const dx = place.x - x;
    const dy = place.y - y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < bestD) {
      bestD = d;
      best = place;
    }
  }
  return best;
}

/** Build the city from a seeded random. Returns the static map data. */
export function createCity(random) {
  const buildings = [];
  const palms = [];
  const lamps = [];
  const parks = [];
  const plazas = [];
  const umbrellas = [];

  const xBands = [0, ...ROAD.verticals, WORLD.width];
  const yBands = [0, ...ROAD.horizontals, ROAD.beachTop];
  for (let column = 0; column < xBands.length - 1; column += 1) {
    for (let row = 0; row < yBands.length - 1; row += 1) {
      const edge = 44;
      const x0 = xBands[column] + (column === 0 ? 16 : edge);
      const x1 = xBands[column + 1] - (column === xBands.length - 2 ? 16 : edge);
      const y0 = yBands[row] + (row === 0 ? 16 : edge);
      const y1 = yBands[row + 1] - (row === yBands.length - 2 ? 16 : edge);
      const width = x1 - x0;
      const height = y1 - y0;
      if (width < 60 || height < 60) continue;
      if (isPark(column, row)) {
        parks.push({ x: x0, y: y0, w: width, h: height });
        for (let i = 0; i < 12; i += 1) {
          palms.push({ x: x0 + random.range(20, width - 20), y: y0 + random.range(20, height - 20) });
        }
        continue;
      }
      if (isPlaza(column, row)) {
        plazas.push({ x: x0, y: y0, w: width, h: height });
        continue;
      }
      // Split the block into cells and put a building in some of them.
      const cellsX = width > 220 ? 2 : 1;
      const cellsY = height > 220 ? 2 : 1;
      for (let cx = 0; cx < cellsX; cx += 1) {
        for (let cy = 0; cy < cellsY; cy += 1) {
          if (random.chance(0.22)) continue;
          const cellW = width / cellsX;
          const cellH = height / cellsY;
          const bw = cellW * random.range(0.55, 0.78);
          const bh = cellH * random.range(0.55, 0.78);
          const bx = x0 + cx * cellW + (cellW - bw) / 2;
          const by = y0 + cy * cellH + (cellH - bh) / 2;
          if (pointNearPlace(bx + bw / 2, by + bh / 2, PLACE_KEEP_OUT)) continue;
          buildings.push({
            x: bx,
            y: by,
            w: bw,
            h: bh,
            roof: random.pick(PALETTE.buildingRoof),
            shade: random.range(6, 16),
          });
        }
      }
    }
  }

  // Palms along the beach and the main boulevard (the x=1400 road).
  for (let x = 80; x < WORLD.width - 40; x += 90) {
    palms.push({ x: x + random.range(-14, 14), y: 2302 + random.range(-6, 10) });
  }
  for (let y = 240; y < ROAD.beachTop - 40; y += 150) {
    palms.push({ x: 1400 - 48, y: y + random.range(-10, 10) });
    palms.push({ x: 1400 + 48, y: y + 90 + random.range(-10, 10) });
  }
  // Beach umbrellas, spaced along the sand so the beach reads as a place
  // people go, not just the edge of the map.
  const umbrellaColors = ['#d64545', '#3f7fd0', '#e8b73a', '#4fae62', '#c96fd0'];
  for (let x = 180; x < WORLD.width - 120; x += 260) {
    umbrellas.push({ x: x + random.range(-30, 30), y: 2312 + random.range(-4, 14), color: random.pick(umbrellaColors) });
  }
  // Lamps at the corners of every intersection.
  for (const vx of ROAD.verticals) {
    for (const hy of ROAD.horizontals) {
      lamps.push({ x: vx - 44, y: hy - 44 });
      lamps.push({ x: vx + 44, y: hy + 44 });
    }
  }

  const pier = { x: 2650, y: 2280, w: 100, h: 84 };
  return { buildings, palms, lamps, parks, plazas, umbrellas, pier };
}

// --- Queries ---------------------------------------------------------------

/** True when the point is on a road surface (not the sidewalk). */
export function isOnRoad(x, y) {
  if (y >= ROAD.beachTop) return false;
  for (const vx of ROAD.verticals) if (Math.abs(x - vx) <= ROAD.width / 2) return true;
  for (const hy of ROAD.horizontals) if (Math.abs(y - hy) <= ROAD.width / 2) return true;
  return false;
}

/** True when the point is on a sidewalk band beside a road. */
export function isOnSidewalk(x, y) {
  if (y >= ROAD.beachTop) return false;
  const band = ROAD.width / 2 + 14;
  for (const vx of ROAD.verticals) {
    const d = Math.abs(x - vx);
    if (d > ROAD.width / 2 && d <= band && y < ROAD.beachTop) return true;
  }
  for (const hy of ROAD.horizontals) {
    const d = Math.abs(y - hy);
    if (d > ROAD.width / 2 && d <= band && x < WORLD.width) return true;
  }
  return false;
}

/** True when the point is in the ocean (the pier is walkable, not water). */
export function isWater(city, x, y) {
  if (y < 2340) return false;
  const p = city.pier;
  return !(x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h);
}

/** The first building a circle of radius r at (x, y) overlaps, or null. */
export function hitBuilding(city, x, y, r) {
  for (const b of city.buildings) {
    const nx = clamp(x, b.x, b.x + b.w);
    const ny = clamp(y, b.y, b.y + b.h);
    const dx = x - nx;
    const dy = y - ny;
    if (dx * dx + dy * dy < r * r) return b;
  }
  return null;
}

/**
 * Push a circle out of every building it overlaps. Returns the corrected
 * position and whether it hit anything.
 */
export function resolveCircle(city, x, y, r) {
  let hit = false;
  for (let pass = 0; pass < 3; pass += 1) {
    const b = hitBuilding(city, x, y, r);
    if (!b) break;
    hit = true;
    const nx = clamp(x, b.x, b.x + b.w);
    const ny = clamp(y, b.y, b.y + b.h);
    const dx = x - nx;
    const dy = y - ny;
    if (dx === 0 && dy === 0) {
      // Centre inside the building: leave by the nearest side.
      const left = x - (b.x - r);
      const right = b.x + b.w + r - x;
      const top = y - (b.y - r);
      const bottom = b.y + b.h + r - y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) x = b.x - r;
      else if (m === right) x = b.x + b.w + r;
      else if (m === top) y = b.y - r;
      else y = b.y + b.h + r;
    } else {
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      x = nx + (dx / d) * r;
      y = ny + (dy / d) * r;
    }
  }
  return { x, y, hit };
}

/** The lane offset for a direction of travel on a road (right-hand traffic). */
export function laneOffset(axis, dir) {
  if (axis === 'v') return dir > 0 ? -ROAD.lane : ROAD.lane;
  return dir > 0 ? ROAD.lane : -ROAD.lane;
}

/** The nearest point on the road network to (x, y), with its road and axis. */
export function nearestRoadPoint(x, y) {
  let best = null;
  for (const vx of ROAD.verticals) {
    const d = Math.abs(x - vx);
    if (best === null || d < best.d) best = { d, axis: 'v', line: vx, along: clamp(y, 0, ROAD.beachTop) };
  }
  for (const hy of ROAD.horizontals) {
    const d = Math.abs(y - hy);
    if (best === null || d < best.d) best = { d, axis: 'h', line: hy, along: clamp(x, 0, WORLD.width) };
  }
  return best;
}

/** A random point on a road, for spawning traffic. */
export function randomRoadPoint(random) {
  if (random.chance(0.5)) {
    const line = random.pick(ROAD.verticals);
    return { axis: 'v', line, along: random.range(40, ROAD.beachTop - 40) };
  }
  const line = random.pick(ROAD.horizontals);
  return { axis: 'h', line, along: random.range(40, WORLD.width - 40) };
}

/** A random point on a sidewalk, for spawning pedestrians. */
export function randomSidewalkPoint(random) {
  const road = randomRoadPoint(random);
  const side = random.pick([-1, 1]) * (ROAD.width / 2 + 12);
  if (road.axis === 'v') return { x: road.line + side, y: road.along };
  return { x: road.along, y: road.line + side };
}

/** A random parked-car spot: on a road edge, facing along the road. */
export function randomParkedSpot(random) {
  const road = randomRoadPoint(random);
  const side = random.pick([-1, 1]) * (ROAD.width / 2 - 8);
  const dir = random.pick([-1, 1]);
  if (road.axis === 'v') return { x: road.line + side, y: road.along, angle: dir > 0 ? Math.PI / 2 : -Math.PI / 2 };
  return { x: road.along, y: road.line + side, angle: dir > 0 ? 0 : Math.PI };
}
