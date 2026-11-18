// Solmar — Streets of the Sun, a gta6-01 entry (Node 22, standard library
// only). The game is this directory's game/ folder: plain static files a
// desktop browser loads offline — game/index.html and its ES modules, no
// library and no network request. This program hands it in: it copies game/
// and screenshots/ from beside this file to /output and writes
// /output/dossier.json, the summary the judge reads, with the vendored
// make.fun library.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The game itself: a top-down open-world crime game in the fictional
// sun-soaked coastal city of Solmar. Mara Vega drives, steals cars, outruns
// the Solmar PD, runs Rico's seven-mission story and picks up fares, with a
// wanted level, a minimap, a save, and synthesised sound.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const shotsDir = join(here, 'screenshots');

// A whole PNG or JPEG, by its first bytes: the scorer refuses anything else.
function isImage(path) {
  const head = readFileSync(path);
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return true;
  if (head.length >= 8 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47
    && head[4] === 0x0d && head[5] === 0x0a && head[6] === 0x1a && head[7] === 0x0a) return true;
  return false;
}

// Refuse an entry the scorer would refuse, before writing anything: more
// than 4 screenshots, one over 256 KiB, one that is not a whole PNG or
// JPEG, or a game/index.html over the 1 MiB cap.
function checkScreenshots() {
  if (!existsSync(shotsDir)) throw new Error('screenshots/ is missing');
  const names = readdirSync(shotsDir).filter((name) => !name.startsWith('.')).sort();
  if (names.length < 3 || names.length > 4) {
    throw new Error(`screenshots/ holds ${names.length} images, need 3 or 4`);
  }
  for (const name of names) {
    const path = join(shotsDir, name);
    const size = statSync(path).size;
    if (size > 262144) throw new Error(`screenshots/${name} is ${size} bytes, over the 256 KiB cap`);
    if (!isImage(path)) throw new Error(`screenshots/${name} is not a whole PNG or JPEG`);
  }
  const index = join(here, 'game', 'index.html');
  if (!existsSync(index)) throw new Error('game/index.html is missing');
  const indexSize = statSync(index).size;
  if (indexSize > 1048576) throw new Error(`game/index.html is ${indexSize} bytes, over the 1 MiB cap`);
}

checkScreenshots();

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes
// the bytes; the others refuse an entry the scorer would refuse (more than
// 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB
// of game files, in all, or a path under game/ over 1000 bytes: game/ counts
// beside /output's own 1000-entry cap, its screenshots/ and dossier.json).
const dossierPath = join(out, 'dossier.json');
writeFileSync(
  dossierPath,
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
const dossierSize = statSync(dossierPath).size;
if (dossierSize > 1572864) throw new Error(`dossier.json is ${dossierSize} bytes, over the 1.5 MiB cap`);
