import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

// Run with --runtime-modules <directory containing sharp and @napi-rs/canvas>.
const moduleIndex = process.argv.indexOf('--runtime-modules');
const qualityIndex = process.argv.indexOf('--quality');
const quality = qualityIndex >= 0 ? Number(process.argv[qualityIndex + 1]) : 95;
const install = process.argv.includes('--install');
if (!Number.isInteger(quality) || quality < 1 || quality > 100) throw new Error('Quality must be an integer from 1 to 100');
const requireRuntime = createRequire(moduleIndex >= 0
  ? path.join(path.resolve(process.argv[moduleIndex + 1]), '_resolve.cjs')
  : import.meta.url);
const { createCanvas, loadImage, GlobalFonts } = requireRuntime('@napi-rs/canvas');
const sharp = requireRuntime('sharp');
const root = fileURLToPath(new URL('../', import.meta.url));
const assets = path.join(root, 'public');
const output = path.join(root, 'docs', `notification-icon-webp-q${quality}`);
await mkdir(path.join(output, 'png-reference'), { recursive: true });

// Execute the production drawing routine using a Skia canvas adapter. No browser
// or network access is needed; all images and fonts come from public/.
class CanvasAdapter {
  constructor(width, height) { this.canvas = createCanvas(width, height); }
  getContext(kind) {
    const context = this.canvas.getContext(kind);
    return new Proxy(context, {
      get(target, key) {
        if (key === 'drawImage') return (image, ...args) => target.drawImage(image.canvas ?? image, ...args);
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
      set(target, key, value) { return Reflect.set(target, key, value, target); },
    });
  }
  async convertToBlob() { return new Blob([this.canvas.toBuffer('image/png')], { type: 'image/png' }); }
}

const source = await readFile(path.join(root, 'entrypoints/lib/rewardNotificationIcon.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const sandbox = {
  exports: {},
  require: () => ({ cogs: [], gags: [] }),
  browser: { runtime: { getURL: relative => path.join(assets, relative) } },
  self: { fonts: { add(face) {
    if (!GlobalFonts.register(Buffer.from(face.bytes), face.name)) throw new Error(`Cannot register ${face.name}`);
  } } },
  FontFace: class {
    constructor(name, bytes) { this.name = name; this.bytes = bytes; }
    async load() { return this; }
  },
  fetch: async filename => {
    if (!path.resolve(filename).startsWith(assets + path.sep)) throw new Error('Only bundled assets are allowed');
    const bytes = await readFile(filename);
    return { ok: true, blob: async () => new Blob([bytes]), arrayBuffer: async () => Uint8Array.from(bytes).buffer };
  },
  createImageBitmap: async blob => loadImage(Buffer.from(await blob.arrayBuffer())),
  OffscreenCanvas: CanvasAdapter,
  btoa: value => Buffer.from(value, 'binary').toString('base64'),
  console,
};
vm.runInNewContext(compiled, sandbox);

const variants = [
  ...[20, 35, 50, 65, 80].map(amount => ({ category: 'Toon-Up', amount, subtype: `${amount} Toon-Up`, slug: `toon-up-${amount}` })),
  ...[100, 200, 350, 600].map(amount => ({ category: 'Jellybeans', amount, subtype: `${amount} jellybeans`, slug: `jellybeans-${amount}` })),
];
const results = [];
const sheet = createCanvas(5 * 212, 2 * 242);
const ctx = sheet.getContext('2d');
ctx.fillStyle = '#18202d';
ctx.fillRect(0, 0, sheet.width, sheet.height);
for (const [index, variant] of variants.entries()) {
  const url = await sandbox.exports.renderRewardNotificationIcon({
    type: 'unites', subtype: variant.subtype, count: 1, metadata: { uniteCategory: variant.category },
  });
  if (!url.startsWith('data:image/png;base64,')) throw new Error(`Rendering fell back for ${variant.slug}`);
  const png = Buffer.from(url.split(',')[1], 'base64');
  const webp = await sharp(png).webp({ quality, alphaQuality: 100, effort: 6 }).toBuffer();
  const metadata = await sharp(webp).metadata();
  if (metadata.width !== 192 || metadata.height !== 192 || !metadata.hasAlpha) throw new Error('Incorrect dimensions or lost transparency');
  const alpha = await sharp(webp).extractChannel('alpha').raw().toBuffer();
  // Keep the outer four pixels empty so text clipping cannot be baked in again.
  for (let y = 0; y < 192; y++) {
    for (let x = 0; x < 192; x++) {
      if ((x < 4 || x >= 188 || y < 4 || y >= 188) && alpha[y * 192 + x] !== 0) {
        throw new Error(`Artwork touches the safety margin: ${variant.slug}`);
      }
    }
  }
  await writeFile(path.join(output, `${variant.slug}.webp`), webp);
  if (install) await writeFile(path.join(assets, 'images/unites', `${variant.slug}.webp`), webp);
  await writeFile(path.join(output, 'png-reference', `${variant.slug}.png`), png);
  results.push({ file: `${variant.slug}.webp`, bytes: webp.length, pngBytes: png.length });
  const x = index % 5 * 212;
  const y = Math.floor(index / 5) * 242;
  ctx.drawImage(await loadImage(webp), x + 10, y + 10);
  ctx.fillStyle = '#ffffff';
  ctx.font = '15px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`${variant.subtype} · ${(webp.length / 1024).toFixed(1)} KiB`, x + 106, y + 225);
}
await writeFile(path.join(output, 'preview.png'), sheet.toBuffer('image/png'));
const report = {
  width: 192, height: 192, quality, alphaQuality: 100,
  renderer: 'Production icon drawing routine with @napi-rs/canvas (Skia)',
  icons: results,
  totalWebpBytes: results.reduce((sum, item) => sum + item.bytes, 0),
  totalPngBytes: results.reduce((sum, item) => sum + item.pngBytes, 0),
};
await writeFile(path.join(output, 'sizes.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
