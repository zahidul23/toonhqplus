import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { transform } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const argIndex = process.argv.indexOf('--runtime-modules');
const requireRuntime = createRequire(argIndex >= 0 ? path.join(path.resolve(process.argv[argIndex + 1]), '_resolve.cjs') : import.meta.url);
const sharp = requireRuntime('sharp');
async function walk(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walk(filename));
    else result.push(filename);
  }
  return result;
}
const sourceFiles = [...await walk(path.join(root, 'entrypoints')), path.join(root, 'wxt.config.ts')];
const sources = await Promise.all(sourceFiles.map(async filename => ({ file: path.relative(root, filename), text: await readFile(filename, 'utf8') })));
function group(file) {
  if (file.startsWith('images/sos-cards/')) return 'SOS portraits';
  if (file.startsWith('images/statuses/')) return 'Status effects';
  if (file.startsWith('images/unites/')) return 'Unite images';
  if (file.startsWith('images/suits/')) return 'Cog suit emblems';
  if (/^images\/book_|Shticker_Book/.test(file)) return 'Shticker Book artwork';
  if (/^images\/(foreman|auditor|clerk|president|Skelecog)/.test(file)) return 'Boss and Skelecog artwork';
  if (/^images\/(pinkslips|remotes|sos|summons|unites)/.test(file)) return 'Reward category images';
  if (file.startsWith('images/trashcan')) return 'Trashcan images';
  if (file.startsWith('icon/')) return 'Extension icons and promotional image';
  if (file.startsWith('fonts/')) return 'Fonts';
  return 'Other public files';
}
const assets = [];
for (const filename of await walk(path.join(root, 'public'))) {
  const bytes = await readFile(filename);
  const file = path.relative(path.join(root, 'public'), filename).replaceAll('\\', '/');
  const item = { file, group: group(file), bytes: bytes.length, deflatedBytes: deflateRawSync(bytes).length, hash: createHash('sha256').update(bytes).digest('hex') };
  item.literalReferences = sources.filter(source => source.text.includes(path.basename(file))).map(source => source.file);
  if (/\.(png|webp|jpg|jpeg)$/.test(file)) {
    const metadata = await sharp(bytes).metadata();
    Object.assign(item, { width: metadata.width, height: metadata.height, frames: metadata.pages ?? 1, alpha: metadata.hasAlpha });
    if (file.endsWith('.png')) {
      const q85 = await sharp(bytes).webp({ quality: 85, alphaQuality: 100, effort: 6 }).toBuffer();
      const lossless = await sharp(bytes).webp({ lossless: true, effort: 6 }).toBuffer();
      Object.assign(item, { webpQ85Bytes: q85.length, webpLosslessBytes: lossless.length });
    }
  }
  assets.push(item);
}
const groups = Object.values(assets.reduce((all, item) => {
  const row = all[item.group] ??= { group: item.group, count: 0, bytes: 0, pngBytes: 0, webpQ85Bytes: 0, losslessWebpBytes: 0 };
  row.count++; row.bytes += item.bytes;
  if (item.webpQ85Bytes) { row.pngBytes += item.bytes; row.webpQ85Bytes += item.webpQ85Bytes; row.losslessWebpBytes += item.webpLosslessBytes; }
  return all;
}, {})).sort((a, b) => b.bytes - a.bytes);
const packaged = [];
for (const filename of await walk(path.join(root, '.output/chrome-mv3'))) {
  const bytes = await readFile(filename);
  const file = path.relative(path.join(root, '.output/chrome-mv3'), filename).replaceAll('\\', '/');
  const item = { file, bytes: bytes.length, deflatedBytes: deflateRawSync(bytes).length };
  if (/\.(js|css)$/.test(file)) {
    const minified = await transform(bytes.toString('utf8'), { loader: file.endsWith('.css') ? 'css' : 'js', minify: true, legalComments: 'eof' });
    Object.assign(item, { minifiedBytes: Buffer.byteLength(minified.code), minifiedDeflatedBytes: deflateRawSync(minified.code).length });
  }
  packaged.push(item);
}
const duplicates = [];
for (const filename of await walk(path.join(root, 'assets'))) {
  const hash = createHash('sha256').update(await readFile(filename)).digest('hex');
  for (const asset of assets.filter(item => item.hash === hash)) duplicates.push({ source: path.relative(root, filename), public: asset.file, bytes: asset.bytes });
}
const bundleGroups = Object.values(packaged.reduce((all, item) => {
  const category = item.file.endsWith('.js') ? 'JavaScript' : item.file.endsWith('.css') ? 'CSS' : /\.(png|webp|svg)$/.test(item.file) ? 'Images' : item.file.endsWith('.ttf') ? 'Fonts' : 'HTML and manifest';
  const row = all[category] ??= { category, count: 0, bytes: 0, deflatedBytes: 0 };
  row.count++; row.bytes += item.bytes; row.deflatedBytes += item.deflatedBytes;
  return all;
}, {}));
const report = { groups, bundleGroups, totalPublicBytes: assets.reduce((sum, item) => sum + item.bytes, 0), totalPackagedBytes: packaged.reduce((sum, item) => sum + item.bytes, 0), totalDeflatedBytes: packaged.reduce((sum, item) => sum + item.deflatedBytes, 0), assets: assets.sort((a, b) => b.bytes - a.bytes), packaged: packaged.sort((a, b) => b.bytes - a.bytes), sourceDuplicates: duplicates };
await mkdir(path.join(root, 'docs/asset-audit'), { recursive: true });
await writeFile(path.join(root, 'docs/asset-audit/sizes.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ groups, bundleGroups, totals: { public: report.totalPublicBytes, packaged: report.totalPackagedBytes, deflated: report.totalDeflatedBytes }, largestAssets: report.assets.slice(0, 12), largestBundles: report.packaged.filter(item => item.minifiedBytes).slice(0, 8), noLiteralReferences: assets.filter(item => !item.literalReferences.length).map(({ file, bytes }) => ({ file, bytes })), sourceDuplicates: duplicates }, null, 2));
