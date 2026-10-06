import { readdir, readFile, writeFile, copyFile, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const runtimeIndex = process.argv.indexOf('--runtime-modules');
const requireRuntime = createRequire(runtimeIndex >= 0
  ? path.join(path.resolve(process.argv[runtimeIndex + 1]), '_resolve.cjs') : import.meta.url);
const sharp = requireRuntime('sharp');
const root = fileURLToPath(new URL('../', import.meta.url));
const publicRoot = path.join(root, 'public');
const images = path.join(publicRoot, 'images');
const categories = ['sos', 'unites', 'summons', 'pinkslips', 'remotes', 'remotesheal', 'remotes-combined'];
const sources = categories.map(name => path.join(images, `${name}.png`));
for (const folder of ['statuses', 'unites']) {
  sources.push(...(await readdir(path.join(images, folder))).filter(name => name.endsWith('.png')).map(name => path.join(images, folder, name)));
}
const results = [];
for (const source of sources) {
  if (!path.resolve(source).startsWith(publicRoot + path.sep)) throw new Error('Asset must be inside public/');
  const original = await readFile(source);
  const webp = await sharp(original).webp({ quality: 85, alphaQuality: 100, effort: 6 }).toBuffer();
  const before = await sharp(original).metadata();
  const after = await sharp(webp).metadata();
  if (before.width !== after.width || before.height !== after.height || before.hasAlpha !== after.hasAlpha) throw new Error(`Image metadata changed: ${source}`);
  const beforeAlpha = await sharp(original).ensureAlpha().extractChannel('alpha').raw().toBuffer();
  const afterAlpha = await sharp(webp).ensureAlpha().extractChannel('alpha').raw().toBuffer();
  if (!beforeAlpha.equals(afterAlpha)) throw new Error(`Transparency changed: ${source}`);
  const target = source.replace(/\.png$/, '.webp');
  await writeFile(target, webp);
  await unlink(source);
  results.push({ file: path.relative(publicRoot, target).replaceAll('\\', '/'), before: original.length, after: webp.length });
}
const variants = [...[20, 35, 50, 65, 80].map(amount => `toon-up-${amount}`), ...[100, 200, 350, 600].map(amount => `jellybeans-${amount}`)];
for (const variant of variants) {
  const source = path.join(root, 'docs/notification-icon-webp-q85', `${variant}.webp`);
  const metadata = await sharp(source).metadata();
  if (metadata.width !== 192 || metadata.height !== 192 || !metadata.hasAlpha) throw new Error(`Invalid pre-rendered icon: ${variant}`);
  await copyFile(source, path.join(images, 'unites', `${variant}.webp`));
}
const totalBefore = results.reduce((sum, item) => sum + item.before, 0);
const convertedBytes = results.reduce((sum, item) => sum + item.after, 0);
const prerenderedBytes = (await Promise.all(variants.map(async name => (await readFile(path.join(images, 'unites', `${name}.webp`))).length))).reduce((sum, size) => sum + size, 0);
const report = { quality: 85, alphaQuality: 100, results, totalBefore, convertedBytes, prerenderedBytes, netSavedBytes: totalBefore - convertedBytes - prerenderedBytes };
await mkdir(path.join(root, 'docs/asset-audit'), { recursive: true });
await writeFile(path.join(root, 'docs/asset-audit/implemented.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
