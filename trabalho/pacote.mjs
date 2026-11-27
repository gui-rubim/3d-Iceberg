// Builds helper views of a critic package: 1:1 crops and contact sheets (same pixels as the renders, nothing else).
import { FFMPEG } from './lib.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path';
const dir = path.resolve(process.argv[2]);
const ls = (re) => fs.readdirSync(dir).filter(f => re.test(f)).sort();
const ff = (...a) => execFileSync(FFMPEG, ['-y', '-loglevel', 'error', ...a]);
fs.mkdirSync(path.join(dir, 'recortes'), { recursive: true }); fs.mkdirSync(path.join(dir, 'folhas'), { recursive: true });
for (const f of [...ls(/^pose/), ...ls(/^rajada/)]) for (const [n, x, y] of [['centro', 640, 360], ['esq_baixo', 0, 720], ['dir_cima', 1280, 0]]) { if (f.startsWith('rajada') && n !== 'centro') continue; ff('-i', path.join(dir, f), '-vf', `crop=1280:720:${x}:${y}`, path.join(dir, 'recortes', f.replace('.png', `_1para1_${n}.png`))); }
const sheet = (files, cols, w, out) => { const h = Math.round(w * 9 / 16); ff(...files.flatMap(f => ['-i', path.join(dir, f)]), '-filter_complex', files.map((_, i) => `[${i}:v]scale=${w}:${h}:flags=area[s${i}]`).join(';') + ';' + files.map((_, i) => `[s${i}]`).join('') + `xstack=inputs=${files.length}:layout=${files.map((_, i) => `${(i % cols) * w}_${Math.floor(i / cols) * h}`).join('|')}`, '-frames:v', '1', path.join(dir, 'folhas', out)); };
const seq = ls(/^seq_/);
for (let i = 0; i < seq.length; i += 12) sheet(seq.slice(i, i + 12), 4, 640, `sequencia_${String(i / 2).padStart(2, '0')}s_a_${String(i / 2 + 5.5)}s.png`);
for (const b of ['travessia_descendo', 'fundo', 'travessia_subindo']) sheet(ls(new RegExp('^rajada_' + b)), 4, 960, `rajada_${b}.png`);
console.log(fs.readdirSync(path.join(dir, 'folhas')).join('\n'));
