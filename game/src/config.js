// Solmar — Streets of the Sun: tuning, palette and the shape of the city.
// Everything the other modules agree on lives here, so a number only ever
// changes in one place.
export const VIEW = { width: 1280, height: 720 };
export const STEP = 1 / 60;
export const WORLD = { width: 3200, height: 2400 };

// The road grid. Roads run along these centre lines; the city is a regular
// grid of blocks between them, with the ocean and its beach along the south.
export const ROAD = {
  width: 64,
  lane: 16, // offset of a lane's centre from the road's centre line
  verticals: [200, 600, 1000, 1400, 1800, 2200, 2600, 3000],
  horizontals: [200, 600, 1000, 1400, 1800, 2200],
  // South of this y the roads end and the sand begins.
  beachTop: 2280,
  // West edge of the marina water on the east side.
  marinaLeft: 2960,
};

// How many of each thing a fresh world spawns.
export const SPAWN = {
  traffic: 14,
  parked: 12,
  pedestrians: 26,
  pickups: 14,
};

export const PLAYER = {
  radius: 13,
  walkSpeed: 185,
  runSpeed: 285,
  health: 100,
  regenDelay: 5, // seconds after the last hurt before health creeps back
  regenRate: 2, // health per second while regenerating
  pistolAmmo: 48,
  pistolDamage: 34,
  pistolRange: 420,
  pistolCooldown: 0.28,
};

export const CAR = {
  length: 54,
  width: 26,
  maxSpeed: 560, // sports car, world units per second
  accel: 420,
  brake: 700,
  reverseMax: 180,
  grip: 3.4, // how fast the heading follows the steering
  health: 100,
};

export const WANTED = {
  maxStars: 5,
  decayDelay: 7, // seconds with no police in sight before a star fades
  decayEvery: 4,
  bustSeconds: 2.5, // a police car must sit on the player this long to bust
  maxCops: 6,
  copCruise: 300, // a patrol car's cruising speed along the roads
  copSpeedPerStar: 15, // extra cruise speed per wanted star
  pursuitBoost: 70, // extra speed when a cop is close behind the player
  pursuitRange: 320, // distance inside which the boost applies
};

// Sun-soaked coastal palette: warm sand, teal water, pastel buildings.
export const PALETTE = {
  grass: '#7fae62',
  grassDark: '#74a258',
  sand: '#e8d29a',
  sandDark: '#dcc184',
  water: '#2e8fae',
  waterDeep: '#20718f',
  road: '#4a4a52',
  roadLine: '#e8e3c8',
  sidewalk: '#b9b3a4',
  curb: '#8f8a7c',
  buildingRoof: ['#d97b6c', '#e0a458', '#7fa8c9', '#c97ba8', '#8fb573', '#b08fd0', '#e07a5f', '#6fb3a8'],
  buildingWall: '#6b655c',
  plaza: '#c9c2ae',
  park: '#6da054',
  car: ['#d64545', '#3f7fd0', '#e8b73a', '#e8e6df', '#2f2f38', '#4fae62', '#c96fd0', '#e07830'],
  cop: '#2f6fd0',
  taxi: '#f2c230',
  player: '#e8e6df',
  ped: ['#e07a5f', '#5f8fd0', '#e8c85f', '#8fd07a', '#c95f8f', '#7a6fd0'],
  hud: '#f5f1e6',
  hudDark: '#1c1a18',
  star: '#ffd23e',
  minimapRoad: '#8a8578',
  minimapWater: '#2e8fae',
  minimapBuilding: '#5c564c',
};

export const KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
  enter: ['KeyE'],
  brake: ['Space'],
  horn: ['KeyH'],
  pause: ['KeyP', 'Escape'],
  mute: ['KeyM'],
  restart: ['KeyR'],
  confirm: ['Enter'],
};

export const SAVE_KEY = 'solmar-save-v1';
export const GAME_TITLE = 'SOLMAR';
export const GAME_SUBTITLE = 'Streets of the Sun';
