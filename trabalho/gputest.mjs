import { launch, serve } from './lib.mjs';
import fs from 'node:fs';
fs.writeFileSync('../t.html','<html></html>');
const { srv, url } = await serve();
const { browser, page } = await launch({ headless: process.argv[2] !== 'headed' });
await page.goto(url + '/t.html');
console.log(JSON.stringify(await page.evaluate(async () => {
  if (!navigator.gpu) return 'no gpu';
  const a = await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
  if (!a) return 'no adapter';
  const i = a.info;
  return { vendor: i.vendor, arch: i.architecture, desc: i.description, feats: [...a.features], max3d: a.limits.maxTextureDimension3D, fmt: navigator.gpu.getPreferredCanvasFormat() };
})));
await browser.close(); srv.close(); fs.unlinkSync('../t.html');
