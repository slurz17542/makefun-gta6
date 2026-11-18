// Drawing only: the world's state and the current screen in, pixels out.
// The 1280x720 view is scaled to fit the window and centred. The camera
// shows a 1280x720 window of the city; the HUD and the minimap are drawn in
// view space on top of it.
import { VIEW, WORLD, ROAD, PALETTE, PLAYER } from './config.js';
import { PLACES, nearestPlace } from './city.js';
import { distance } from './random.js';
import { missionMarker, objectiveText } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_FAILED = 'failed';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const MINIMAP = { x: VIEW.width - 216, y: 16, w: 200, h: 150 };

function roundRect(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  function font(size, weight) {
    const key = `${weight || ''}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight ? weight + ' ' : ''}${size}px ${FONT}`);
    return fonts.get(key);
  }

  function text(value, x, y, size, color, align, weight) {
    context.font = font(size, weight);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function inView(state, x, y, margin) {
    const cam = state.camera;
    return x > cam.x - VIEW.width / 2 - margin && x < cam.x + VIEW.width / 2 + margin
      && y > cam.y - VIEW.height / 2 - margin && y < cam.y + VIEW.height / 2 + margin;
  }

  // --- The world -----------------------------------------------------------

  function drawGround(state) {
    const city = state.city;
    const cam = state.camera;
    const left = cam.x - VIEW.width / 2;
    const top = cam.y - VIEW.height / 2;
    // Grass base.
    context.fillStyle = PALETTE.grass;
    context.fillRect(left, top, VIEW.width, VIEW.height);
    // Parks and the plaza.
    for (const park of city.parks) {
      context.fillStyle = PALETTE.park;
      context.fillRect(park.x, park.y, park.w, park.h);
    }
    for (const plaza of city.plazas) {
      context.fillStyle = PALETTE.plaza;
      context.fillRect(plaza.x, plaza.y, plaza.w, plaza.h);
    }
    // Beach and ocean.
    context.fillStyle = PALETTE.sand;
    context.fillRect(left, ROAD.beachTop, VIEW.width, 60);
    context.fillStyle = PALETTE.water;
    context.fillRect(left, 2340, VIEW.width, WORLD.height - 2340);
    context.fillStyle = PALETTE.waterDeep;
    for (let x = Math.floor(left / 90) * 90; x < left + VIEW.width; x += 90) {
      context.fillRect(x, 2360 + ((x / 90) % 3) * 14, 46, 4);
    }
    // The pier.
    const pier = city.pier;
    context.fillStyle = '#8a6b48';
    context.fillRect(pier.x, pier.y, pier.w, pier.h);
    context.fillStyle = '#a5855e';
    for (let y = pier.y + 8; y < pier.y + pier.h; y += 14) context.fillRect(pier.x, y, pier.w, 2);
    // Roads: sidewalk band, road surface, centre dashes, crosswalks.
    for (const vx of ROAD.verticals) {
      context.fillStyle = PALETTE.sidewalk;
      context.fillRect(vx - ROAD.width / 2 - 14, 0, ROAD.width + 28, ROAD.beachTop);
      context.fillStyle = PALETTE.road;
      context.fillRect(vx - ROAD.width / 2, 0, ROAD.width, ROAD.beachTop);
    }
    for (const hy of ROAD.horizontals) {
      context.fillStyle = PALETTE.sidewalk;
      context.fillRect(0, hy - ROAD.width / 2 - 14, WORLD.width, ROAD.width + 28);
      context.fillStyle = PALETTE.road;
      context.fillRect(0, hy - ROAD.width / 2, WORLD.width, ROAD.width);
    }
    context.fillStyle = PALETTE.roadLine;
    for (const vx of ROAD.verticals) {
      for (let y = 20; y < ROAD.beachTop; y += 48) context.fillRect(vx - 2, y, 4, 26);
    }
    for (const hy of ROAD.horizontals) {
      for (let x = 20; x < WORLD.width; x += 48) context.fillRect(x, hy - 2, 26, 4);
    }
    for (const vx of ROAD.verticals) {
      for (const hy of ROAD.horizontals) {
        context.fillStyle = 'rgba(232,227,200,0.85)';
        for (let i = -3; i <= 3; i += 1) {
          context.fillRect(vx - 26 + i * 8, hy - ROAD.width / 2 + 4, 4, 10);
          context.fillRect(vx - 26 + i * 8, hy + ROAD.width / 2 - 14, 4, 10);
        }
      }
    }
  }

  function drawBuildings(state) {
    for (const b of state.city.buildings) {
      if (!inView(state, b.x + b.w / 2, b.y + b.h / 2, 120)) continue;
      context.fillStyle = 'rgba(0,0,0,0.25)';
      context.fillRect(b.x + b.shade, b.y + b.shade, b.w, b.h);
      context.fillStyle = PALETTE.buildingWall;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.fillStyle = b.roof;
      context.fillRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6);
      context.fillStyle = 'rgba(255,255,255,0.25)';
      context.fillRect(b.x + 8, b.y + 8, Math.min(26, b.w - 16), Math.min(18, b.h - 16));
      context.fillStyle = 'rgba(0,0,0,0.18)';
      context.fillRect(b.x + b.w - 22, b.y + b.h - 18, 14, 10);
    }
  }

  function drawProps(state) {
    for (const palm of state.city.palms) {
      if (!inView(state, palm.x, palm.y, 40)) continue;
      context.fillStyle = 'rgba(0,0,0,0.2)';
      context.beginPath();
      context.ellipse(palm.x + 4, palm.y + 5, 12, 5, 0, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#7a5a34';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(palm.x, palm.y);
      context.lineTo(palm.x + 2, palm.y - 14);
      context.stroke();
      context.fillStyle = '#4e8f3e';
      for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * Math.PI * 2 + 0.4;
        context.beginPath();
        context.ellipse(palm.x + 2 + Math.cos(a) * 9, palm.y - 15 + Math.sin(a) * 6, 9, 3.5, a, 0, Math.PI * 2);
        context.fill();
      }
    }
    // Beach umbrellas: a coloured half-disc on a pole, with a soft shadow.
    for (const umbrella of state.city.umbrellas) {
      if (!inView(state, umbrella.x, umbrella.y, 30)) continue;
      context.fillStyle = 'rgba(0,0,0,0.18)';
      context.beginPath();
      context.ellipse(umbrella.x + 3, umbrella.y + 4, 12, 4, 0, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#7a5a34';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(umbrella.x, umbrella.y);
      context.lineTo(umbrella.x, umbrella.y - 10);
      context.stroke();
      context.fillStyle = umbrella.color;
      context.beginPath();
      context.arc(umbrella.x, umbrella.y - 10, 11, Math.PI, 0);
      context.fill();
    }
    context.fillStyle = '#3c3a36';
    for (const lamp of state.city.lamps) {
      if (!inView(state, lamp.x, lamp.y, 20)) continue;
      context.fillRect(lamp.x - 1, lamp.y - 1, 3, 3);
    }
  }

  function drawPickups(state) {
    for (const p of state.pickups) {
      if (p.respawn > 0 || !inView(state, p.x, p.y, 30)) continue;
      const bob = Math.sin(p.bob) * 2;
      context.fillStyle = 'rgba(0,0,0,0.25)';
      context.beginPath();
      context.ellipse(p.x, p.y + 8, 10, 4, 0, 0, Math.PI * 2);
      context.fill();
      if (p.kind === 'health') {
        context.fillStyle = '#e8e6df';
        roundRect(context, p.x - 9, p.y - 9 + bob, 18, 18, 4);
        context.fill();
        context.fillStyle = '#d64545';
        context.fillRect(p.x - 2, p.y - 6 + bob, 4, 12);
        context.fillRect(p.x - 6, p.y - 2 + bob, 12, 4);
      } else if (p.kind === 'ammo') {
        context.fillStyle = '#f2c230';
        roundRect(context, p.x - 9, p.y - 9 + bob, 18, 18, 4);
        context.fill();
        context.fillStyle = '#1c1a18';
        text('A', p.x, p.y + 5 + bob, 13, '#1c1a18', 'center', 'bold');
      } else {
        context.fillStyle = '#2fae5f';
        context.beginPath();
        context.arc(p.x, p.y + bob, 9, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#f5f1e6';
        text('$', p.x, p.y + 5 + bob, 13, '#f5f1e6', 'center', 'bold');
      }
    }
  }

  function drawPed(state, ped) {
    if (!inView(state, ped.x, ped.y, 30)) return;
    const bob = ped.state === 'walk' ? Math.sin(ped.bob) * 1.5 : 0;
    context.fillStyle = 'rgba(0,0,0,0.25)';
    context.beginPath();
    context.ellipse(ped.x, ped.y + 8, 9, 4, 0, 0, Math.PI * 2);
    context.fill();
    if (ped.state === 'down') {
      context.fillStyle = ped.color;
      context.save();
      context.translate(ped.x, ped.y);
      context.rotate(ped.angle + Math.PI / 2);
      context.beginPath();
      context.ellipse(0, 0, 13, 6, 0, 0, Math.PI * 2);
      context.fill();
      context.restore();
      return;
    }
    context.fillStyle = ped.rival ? '#c22e2e' : ped.color;
    context.beginPath();
    context.arc(ped.x, ped.y + bob, 9, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#e8c39a';
    context.beginPath();
    context.arc(ped.x, ped.y - 2 + bob, 5, 0, Math.PI * 2);
    context.fill();
    // Facing tick.
    context.strokeStyle = 'rgba(0,0,0,0.4)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(ped.x, ped.y);
    context.lineTo(ped.x + Math.cos(ped.angle) * 12, ped.y + Math.sin(ped.angle) * 12);
    context.stroke();
    if (ped.fare || ped.crew) {
      context.fillStyle = ped.crew ? '#ffd23e' : '#2fae5f';
      context.beginPath();
      context.arc(ped.x, ped.y - 26 + bob, 9, 0, Math.PI * 2);
      context.fill();
      text('!', ped.x, ped.y - 21 + bob, 13, '#1c1a18', 'center', 'bold');
    }
    if (ped.rival) {
      context.strokeStyle = '#1c1a18';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(ped.x, ped.y);
      context.lineTo(ped.x + Math.cos(ped.angle) * 20, ped.y + Math.sin(ped.angle) * 20);
      context.stroke();
    }
  }

  function drawCar(state, car) {
    if (!inView(state, car.x, car.y, 60)) return;
    const t = state.time;
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    context.fillStyle = 'rgba(0,0,0,0.3)';
    context.beginPath();
    context.ellipse(3, 5, car.length / 2 + 2, car.width / 2 + 3, 0, 0, Math.PI * 2);
    context.fill();
    // Wheels.
    context.fillStyle = '#1c1a18';
    const wl = car.length / 2 - 10;
    const ww = car.width / 2 - 1;
    context.fillRect(-wl - 5, -ww - 3, 11, 6);
    context.fillRect(wl - 6, -ww - 3, 11, 6);
    context.fillRect(-wl - 5, ww - 3, 11, 6);
    context.fillRect(wl - 6, ww - 3, 11, 6);
    // Body.
    context.fillStyle = car.wrecked ? '#3a3835' : car.color;
    roundRect(context, -car.length / 2, -car.width / 2, car.length, car.width, 8);
    context.fill();
    if (!car.wrecked) {
      // Windows and roof.
      context.fillStyle = 'rgba(20,30,44,0.85)';
      roundRect(context, -car.length / 2 + 12, -car.width / 2 + 5, 12, car.width - 10, 3);
      context.fill();
      context.fillStyle = 'rgba(20,30,44,0.65)';
      roundRect(context, -4, -car.width / 2 + 4, 16, car.width - 8, 4);
      context.fill();
      // Headlights.
      context.fillStyle = '#ffe9a8';
      context.fillRect(car.length / 2 - 2, -car.width / 2 + 3, 3, 5);
      context.fillRect(car.length / 2 - 2, car.width / 2 - 8, 3, 5);
      if (car.kind === 'taxi') {
        context.fillStyle = '#f2c230';
        context.fillRect(-6, -5, 12, 10);
        context.fillStyle = '#1c1a18';
        text('T', 0, 4, 9, '#1c1a18', 'center', 'bold');
      }
      if (car.kind === 'cop') {
        const on = Math.floor(t * 3) % 2 === 0;
        context.fillStyle = on ? '#e5484d' : '#2f6fd0';
        context.fillRect(-8, -car.width / 2 + 2, 8, 5);
        context.fillStyle = on ? '#2f6fd0' : '#e5484d';
        context.fillRect(0, -car.width / 2 + 2, 8, 5);
        context.fillStyle = '#f5f1e6';
        text('PD', 0, car.width / 2 - 6, 8, '#f5f1e6', 'center', 'bold');
      }
      if (car.armored) {
        context.strokeStyle = '#f2c230';
        context.lineWidth = 2;
        roundRect(context, -car.length / 2 + 2, -car.width / 2 + 2, car.length - 4, car.width - 4, 6);
        context.stroke();
      }
    }
    context.restore();
    if (car.smoke > 0.2) {
      context.fillStyle = 'rgba(60,60,60,0.5)';
      context.beginPath();
      context.arc(car.x + Math.sin(t * 2) * 4, car.y - 8, 8 + Math.sin(t * 3) * 2, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawPlayer(state) {
    const player = state.player;
    if (player.car) return;
    if (!inView(state, player.x, player.y, 40)) return;
    const bob = player.moving ? Math.sin(player.bob) * 1.5 : 0;
    context.fillStyle = 'rgba(0,0,0,0.3)';
    context.beginPath();
    context.ellipse(player.x, player.y + 9, 10, 4, 0, 0, Math.PI * 2);
    context.fill();
    const blink = player.hurtCooldown > 0 && Math.floor(player.hurtCooldown * 12) % 2 === 0;
    if (!blink) {
      context.fillStyle = '#e8e6df';
      context.beginPath();
      context.arc(player.x, player.y + bob, 10, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#e8c39a';
      context.beginPath();
      context.arc(player.x, player.y - 2 + bob, 5.5, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#d64545';
      context.beginPath();
      context.arc(player.x, player.y - 4 + bob, 5.5, Math.PI, 0);
      context.fill();
      context.strokeStyle = '#1c1a18';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(player.x, player.y);
      context.lineTo(player.x + Math.cos(player.angle) * 14, player.y + Math.sin(player.angle) * 14);
      context.stroke();
    }
  }

  function drawParticles(state) {
    for (const p of state.particles) {
      const a = Math.max(0, p.life / p.max);
      if (p.kind === 'tracer') {
        context.strokeStyle = `rgba(255,220,120,${a})`;
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(p.x, p.y);
        context.lineTo(p.x2, p.y2);
        context.stroke();
      } else if (p.kind === 'flash') {
        context.fillStyle = `rgba(255,240,180,${a})`;
        context.beginPath();
        context.arc(p.x, p.y, 7 * a + 2, 0, Math.PI * 2);
        context.fill();
      } else if (p.kind === 'smoke') {
        context.fillStyle = `rgba(70,70,70,${a * 0.45})`;
        context.beginPath();
        context.arc(p.x, p.y, 10 + (1 - a) * 14, 0, Math.PI * 2);
        context.fill();
      } else if (p.kind === 'skid') {
        context.strokeStyle = `rgba(20,20,20,${a * 0.55})`;
        context.lineWidth = 4;
        context.beginPath();
        context.moveTo(p.x - Math.cos(p.angle) * 8, p.y - Math.sin(p.angle) * 8);
        context.lineTo(p.x + Math.cos(p.angle) * 8, p.y + Math.sin(p.angle) * 8);
        context.stroke();
      } else if (p.kind === 'hit') {
        context.fillStyle = `rgba(255,210,62,${a})`;
        context.beginPath();
        context.arc(p.x, p.y, 6 * a + 2, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  function drawMarker(state) {
    const marker = missionMarker(state);
    if (!marker) return;
    const cam = state.camera;
    const left = cam.x - VIEW.width / 2;
    const top = cam.y - VIEW.height / 2;
    const pulse = 1 + Math.sin(state.time * 4) * 0.15;
    const sx = marker.x - left;
    const sy = marker.y - top;
    if (sx > 40 && sx < VIEW.width - 40 && sy > 40 && sy < VIEW.height - 40) {
      context.strokeStyle = '#ffd23e';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(sx, sy, 26 * pulse, 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = '#ffd23e';
      context.beginPath();
      context.arc(sx, sy, 5, 0, Math.PI * 2);
      context.fill();
      text(marker.label, sx, sy - 36, 15, '#ffd23e', 'center', 'bold');
      return;
    }
    // Off-screen: an arrow at the edge pointing at it.
    const cx = VIEW.width / 2;
    const cy = VIEW.height / 2;
    const angle = Math.atan2(sy - cy, sx - cx);
    const ex = cx + Math.cos(angle) * (VIEW.width / 2 - 60);
    const ey = cy + Math.sin(angle) * (VIEW.height / 2 - 60);
    context.save();
    context.translate(ex, ey);
    context.rotate(angle);
    context.fillStyle = '#ffd23e';
    context.beginPath();
    context.moveTo(16, 0);
    context.lineTo(-10, -11);
    context.lineTo(-10, 11);
    context.closePath();
    context.fill();
    context.restore();
    text(marker.label, ex, ey - 20, 13, '#ffd23e', 'center', 'bold');
  }

  /** The aim crosshair at the mouse, while playing and aiming. */
  function drawCrosshair(state) {
    const aim = state.aimView;
    if (!aim) return;
    context.strokeStyle = 'rgba(255,210,62,0.9)';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(aim.x, aim.y, 9, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.moveTo(aim.x - 13, aim.y);
    context.lineTo(aim.x - 5, aim.y);
    context.moveTo(aim.x + 5, aim.y);
    context.lineTo(aim.x + 13, aim.y);
    context.moveTo(aim.x, aim.y - 13);
    context.lineTo(aim.x, aim.y - 5);
    context.moveTo(aim.x, aim.y + 5);
    context.lineTo(aim.x, aim.y + 13);
    context.stroke();
  }

  // --- HUD -----------------------------------------------------------------

  function drawMinimap(state) {
    const { x, y, w, h } = MINIMAP;
    const sx = w / WORLD.width;
    const sy = h / WORLD.height;
    context.fillStyle = 'rgba(16,16,20,0.82)';
    roundRect(context, x - 4, y - 4, w + 8, h + 8, 6);
    context.fill();
    context.save();
    context.beginPath();
    roundRect(context, x, y, w, h, 4);
    context.clip();
    context.fillStyle = PALETTE.minimapWater;
    context.fillRect(x, y + ROAD.beachTop * sy, w, h - ROAD.beachTop * sy);
    context.fillStyle = '#6da054';
    context.fillRect(x, y, w, h);
    context.strokeStyle = PALETTE.minimapRoad;
    context.lineWidth = 3;
    for (const vx of ROAD.verticals) {
      context.beginPath();
      context.moveTo(x + vx * sx, y);
      context.lineTo(x + vx * sx, y + ROAD.beachTop * sy);
      context.stroke();
    }
    for (const hy of ROAD.horizontals) {
      context.beginPath();
      context.moveTo(x, y + hy * sy);
      context.lineTo(x + w, y + hy * sy);
      context.stroke();
    }
    context.fillStyle = PALETTE.minimapBuilding;
    for (const b of state.city.buildings) context.fillRect(x + b.x * sx, y + b.y * sy, Math.max(1.5, b.w * sx), Math.max(1.5, b.h * sy));
    const marker = missionMarker(state);
    if (marker) {
      context.fillStyle = '#ffd23e';
      context.beginPath();
      context.arc(x + marker.x * sx, y + marker.y * sy, 4, 0, Math.PI * 2);
      context.fill();
    }
    // A waiting fare shows green; Venn's armored van shows gold.
    if (state.missions.fare.phase === 'wait' && state.missions.fare.ped) {
      const ped = state.missions.fare.ped;
      context.fillStyle = '#2fae5f';
      context.beginPath();
      context.arc(x + ped.x * sx, y + ped.y * sy, 3, 0, Math.PI * 2);
      context.fill();
    }
    if (state.missions.van && !state.missions.van.wrecked) {
      const van = state.missions.van;
      context.fillStyle = '#f2c230';
      context.beginPath();
      context.arc(x + van.x * sx, y + van.y * sy, 3, 0, Math.PI * 2);
      context.fill();
    }
    for (const car of state.cars) {
      if (car.driver !== 'police' || car.wrecked) continue;
      context.fillStyle = '#5fa8ff';
      context.beginPath();
      context.arc(x + car.x * sx, y + car.y * sy, 3, 0, Math.PI * 2);
      context.fill();
    }
    const player = state.player;
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.arc(x + player.x * sx, y + player.y * sy, 4, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#ffffff';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x + player.x * sx, y + player.y * sy);
    context.lineTo(x + (player.x + Math.cos(player.angle) * 90) * sx, y + (player.y + Math.sin(player.angle) * 90) * sy);
    context.stroke();
    context.restore();
    // Camera view rectangle.
    const cam = state.camera;
    context.strokeStyle = 'rgba(255,255,255,0.5)';
    context.lineWidth = 1;
    context.strokeRect(x + (cam.x - VIEW.width / 2) * sx, y + (cam.y - VIEW.height / 2) * sy, VIEW.width * sx, VIEW.height * sy);
    text('SOLMAR', x + w, y + h + 16, 11, 'rgba(245,241,230,0.75)', 'right', 'bold');
  }

  function drawStars(state) {
    const stars = state.police.stars;
    const x0 = 20;
    const y0 = 26;
    for (let i = 0; i < 5; i += 1) {
      const cx = x0 + i * 26;
      context.font = font(22, 'bold');
      context.fillStyle = i < stars ? PALETTE.star : 'rgba(245,241,230,0.25)';
      context.textAlign = 'center';
      context.fillText('★', cx, y0);
    }
    if (stars > 0) text('WANTED', x0 + 5 * 26 + 8, y0, 13, '#ffb3b3', 'left', 'bold');
  }

  function drawHud(state, save) {
    const player = state.player;
    drawStars(state);
    // Health.
    const hx = 20;
    const hy = 44;
    context.fillStyle = 'rgba(16,16,20,0.6)';
    roundRect(context, hx, hy, 180, 16, 8);
    context.fill();
    context.fillStyle = player.health > 30 ? '#4fae62' : '#d64545';
    roundRect(context, hx + 2, hy + 2, 176 * Math.max(0, player.health / PLAYER.health), 12, 6);
    context.fill();
    text(`${Math.ceil(player.health)}`, hx + 190, hy + 13, 13, PALETTE.hud, 'left', 'bold');
    // Cash.
    text(`$${state.cash.toLocaleString('en-US')}`, 20, 88, 20, '#7de38a', 'left', 'bold');
    // Ammo / speed.
    if (player.car) {
      const kmh = Math.round(Math.abs(player.car.speed) * 0.24);
      text(`${kmh}`, VIEW.width - 24, VIEW.height - 44, 34, PALETTE.hud, 'right', 'bold');
      text('km/h', VIEW.width - 24, VIEW.height - 20, 13, 'rgba(245,241,230,0.7)', 'right');
      if (player.car.health < 100) {
        text(`CAR ${Math.ceil(player.car.health)}%`, VIEW.width - 24, VIEW.height - 78, 14, player.car.health < 40 ? '#ff9a9a' : PALETTE.hud, 'right', 'bold');
      }
    } else {
      text(`AMMO ${player.ammo}`, 20, VIEW.height - 24, 16, PALETTE.hud, 'left', 'bold');
    }
    drawMinimap(state);
    // Objective.
    const objective = objectiveText(state);
    if (objective) {
      context.font = font(15, 'bold');
      const width = context.measureText(objective).width + 28;
      context.fillStyle = 'rgba(16,16,20,0.65)';
      roundRect(context, (VIEW.width - width) / 2, 14, width, 28, 14);
      context.fill();
      text(objective, VIEW.width / 2, 33, 15, PALETTE.hud, 'center', 'bold');
    }
    // The district the player is in, under the objective.
    const place = nearestPlace(player.x, player.y, 170);
    if (place) text(place.label, VIEW.width / 2, 62, 14, 'rgba(245,241,230,0.6)', 'center');
    // Mission banner card.
    const banner = state.missions.banner;
    if (banner && state.missions.bannerTimer > 0) {
      const alpha = Math.min(1, state.missions.bannerTimer);
      context.save();
      context.globalAlpha = alpha;
      const lines = [banner.text];
      const width = 560;
      const height = 118;
      const bx = (VIEW.width - width) / 2;
      const by = 84;
      context.fillStyle = 'rgba(16,16,20,0.88)';
      roundRect(context, bx, by, width, height, 10);
      context.fill();
      context.strokeStyle = '#ffd23e';
      context.lineWidth = 2;
      roundRect(context, bx, by, width, height, 10);
      context.stroke();
      text(banner.title, VIEW.width / 2, by + 38, 26, '#ffd23e', 'center', 'bold');
      text(lines[0], VIEW.width / 2, by + 72, 16, PALETTE.hud, 'center');
      if (banner.giver) text(`— ${banner.giver}`, VIEW.width / 2, by + 98, 13, 'rgba(245,241,230,0.65)', 'center');
      context.restore();
    }
    // Controls hint, early in a run.
    if (state.time < 14 && !player.car) {
      text('WASD move · Shift run · E enter a car · Click to shoot · H horn · P pause · M mute', VIEW.width / 2, VIEW.height - 24, 14, 'rgba(245,241,230,0.75)', 'center');
    } else if (state.time < 14 && player.car) {
      text('WASD drive · Space brake · E get out · Click to shoot from the car · H horn · P pause', VIEW.width / 2, VIEW.height - 24, 14, 'rgba(245,241,230,0.75)', 'center');
    }
    // Hurt vignette.
    if (player.hurtCooldown > 0) {
      context.strokeStyle = `rgba(214,69,69,${player.hurtCooldown * 0.8})`;
      context.lineWidth = 26;
      context.strokeRect(0, 0, VIEW.width, VIEW.height);
    }
    // Bust warning.
    if (state.police.bustTimer > 0.4) {
      text('THEY ARE ON YOU — DRIVE!', VIEW.width / 2, 130, 20, '#ff9a9a', 'center', 'bold');
    }
  }

  // --- Screens ---------------------------------------------------------------

  function drawPanel(title, lines, prompt, accent) {
    const width = 640;
    const height = 150 + lines.length * 30;
    const x = (VIEW.width - width) / 2;
    const y = (VIEW.height - height) / 2;
    context.fillStyle = 'rgba(16,16,20,0.88)';
    roundRect(context, x, y, width, height, 12);
    context.fill();
    context.strokeStyle = accent || '#ffd23e';
    context.lineWidth = 2;
    roundRect(context, x, y, width, height, 12);
    context.stroke();
    text(title, VIEW.width / 2, y + 62, 40, accent || '#ffd23e', 'center', 'bold');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], VIEW.width / 2, y + 104 + i * 30, 17, PALETTE.hud, 'center');
    }
    text(prompt, VIEW.width / 2, y + height - 26, 17, '#ffd23e', 'center', 'bold');
  }

  function drawTitle(state, save) {
    // The city behind, dimmed.
    context.fillStyle = 'rgba(10,10,16,0.55)';
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    text('SOLMAR', VIEW.width / 2, 168, 92, '#ffd23e', 'center', 'bold');
    text('STREETS OF THE SUN', VIEW.width / 2, 208, 24, PALETTE.hud, 'center', 'bold');
    text('Mara Vega owes money, and Rico has work for her.', VIEW.width / 2, 286, 18, PALETTE.hud, 'center');
    text('Steal cars, outrun the PD, run the jobs — and take back Solmar.', VIEW.width / 2, 316, 18, PALETTE.hud, 'center');
    text('WASD move / drive · E enter a car · Click to shoot · Space brake', VIEW.width / 2, 396, 16, 'rgba(245,241,230,0.85)', 'center');
    text('H horn · P pause · M mute · Your progress saves in this browser', VIEW.width / 2, 424, 16, 'rgba(245,241,230,0.85)', 'center');
    if (save && (save.cash > 0 || save.missionIndex > 0)) {
      text(`Continue: $${save.cash.toLocaleString('en-US')} · Mission ${Math.min(save.missionIndex + 1, 7)} of 7`, VIEW.width / 2, 470, 16, '#7de38a', 'center');
    }
    text('Press ENTER to start', VIEW.width / 2, 556, 22, '#ffd23e', 'center', 'bold');
  }

  function draw(state, screen, save) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#11141b';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    // World space, centred on the camera.
    context.save();
    context.translate(VIEW.width / 2 - state.camera.x, VIEW.height / 2 - state.camera.y);
    drawGround(state);
    drawBuildings(state);
    drawProps(state);
    drawPickups(state);
    for (const ped of state.peds) drawPed(state, ped);
    // Cars under the player, so the player reads on top when on foot.
    for (const car of state.cars) drawCar(state, car);
    drawPlayer(state);
    drawParticles(state);
    context.restore();
    // View space: marker, crosshair, HUD, screens.
    drawMarker(state);
    if (screen === SCREEN_PLAY) drawCrosshair(state);
    if (screen === SCREEN_TITLE) {
      drawTitle(state, save);
      return;
    }
    drawHud(state, save);
    if (screen === SCREEN_PAUSED) {
      context.fillStyle = 'rgba(10,10,16,0.55)';
      context.fillRect(0, 0, VIEW.width, VIEW.height);
      drawPanel('PAUSED', ['The city waits for you.', 'WASD move / drive · E enter a car · Click to shoot'], 'Press P to resume');
    } else if (screen === SCREEN_BUSTED) {
      context.fillStyle = 'rgba(10,16,40,0.72)';
      context.fillRect(0, 0, VIEW.width, VIEW.height);
      drawPanel('BUSTED', ['The PD caught up with you.', `You lost $${state.bustFine || 0}.`], 'Press ENTER to continue', '#5fa8ff');
    } else if (screen === SCREEN_WASTED) {
      context.fillStyle = 'rgba(40,10,10,0.72)';
      context.fillRect(0, 0, VIEW.width, VIEW.height);
      drawPanel('WASTED', ['Solmar General patched you up.', `You lost $${state.bustFine || 0}.`], 'Press ENTER to continue', '#e5484d');
    } else if (screen === SCREEN_FAILED) {
      context.fillStyle = 'rgba(10,10,16,0.55)';
      context.fillRect(0, 0, VIEW.width, VIEW.height);
      const banner = state.missions.banner;
      drawPanel('MISSION FAILED', [banner ? banner.text : 'The job fell through.'], 'Press ENTER to retry', '#e5484d');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
