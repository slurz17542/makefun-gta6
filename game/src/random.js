// A small seeded random number generator (mulberry32) plus the helpers the
// city and the traffic use, so the same seed always builds the same Solmar
// and the screenshot scenes are repeatable.
export function createRandom(seed) {
  let a = seed | 0;
  function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  // A float in [min, max).
  random.range = function range(min, max) {
    return min + random() * (max - min);
  };
  // An integer in [min, max] inclusive.
  random.int = function int(min, max) {
    return Math.floor(random() * (max - min + 1)) + min;
  };
  // One entry of an array, or undefined for an empty one.
  random.pick = function pick(list) {
    return list.length === 0 ? undefined : list[Math.floor(random() * list.length)];
  };
  // True with the given probability.
  random.chance = function chance(p) {
    return random() < p;
  };
  // A copy of the list shuffled in place order (Fisher-Yates).
  random.shuffle = function shuffle(list) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  };
  return random;
}

// Clamp a number into [min, max].
export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

// Linear interpolation between `a` and `b` by `t` (0..1).
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Move `value` toward `target` by at most `step`.
export function approach(value, target, step) {
  if (value < target) return Math.min(target, value + step);
  if (value > target) return Math.max(target, value - step);
  return value;
}

// The shortest signed turn from angle `from` to angle `to`, in radians.
export function angleDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Euclidean distance between two points.
export function distance(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}
