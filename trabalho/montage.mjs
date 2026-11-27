// usage: node montage.mjs out.png cols scaleW file1 file2 ...
import { FFMPEG } from './lib.mjs';
import { execFileSync } from 'node:child_process';
const [out, cols, sw, ...files] = process.argv.slice(2);
const c = +cols, w = +sw;
const sc = files.map((_, i) => `[${i}:v]scale=${w}:-2[s${i}]`).join(';');
const h = Math.round(w * 9 / 16);
const lay = files.map((_, i) => `${(i % c) * w}_${Math.floor(i / c) * h}`).join('|');
execFileSync(FFMPEG, ['-y', '-loglevel', 'error', ...files.flatMap(f => ['-i', f]), '-filter_complex', `${sc};${files.map((_, i) => `[s${i}]`).join('')}xstack=inputs=${files.length}:layout=${lay}`, '-frames:v', '1', out]);
