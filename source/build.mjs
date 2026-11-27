// Build: inlines the WGSL sources and main.js into a single self-contained ../index.html
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const rd = (f) => fs.readFileSync(path.join(here, f), 'utf8');
const minWgsl = (s) => s.replace(/\/\/.*$/gm, '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').replace(/^ /gm, '').trim();
const SH = {};
for (const n of ['common', 'bake', 'waves', 'scene', 'post', 'particles']) SH[n] = process.argv.includes('--raw') ? rd(n + '.wgsl') : minWgsl(rd(n + '.wgsl'));
const out = rd('index.template.html').replace('/*__SHADERS__*/', () => JSON.stringify(SH)).replace('/*__MAIN__*/', () => rd('main.js'));
fs.writeFileSync(path.join(here, '..', 'index.html'), out);
console.log('index.html', fs.statSync(path.join(here, '..', 'index.html')).size, 'bytes');
