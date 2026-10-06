import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const runtimeIndex = process.argv.indexOf('--runtime-modules');
const refIndex = process.argv.indexOf('--source-ref');
const sourceRef = refIndex >= 0 ? process.argv[refIndex + 1] : null;
const requireRuntime = createRequire(runtimeIndex >= 0
  ? path.join(path.resolve(process.argv[runtimeIndex + 1]), '_resolve.cjs') : import.meta.url);
const sharp = requireRuntime('sharp');
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, 'public/images/statuses');
const results = [];
const thumbnails = [];
for (const name of (await readdir(directory)).filter(name => name.endsWith('.webp')).sort()) {
  const filename = path.join(directory, name);
  const current = await readFile(filename);
  // Optional Git source avoids recompressing a previously lossy WebP.
  const source = sourceRef
    ? execFileSync('git', ['show', `${sourceRef}:public/images/statuses/${name.replace(/\.webp$/, '.png')}`], { cwd: root })
    : current;
  const resized = await sharp(source).resize(96, 96, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85, alphaQuality: 100, effort: 6 }).toBuffer();
  const metadata = await sharp(resized).metadata();
  if (metadata.width !== 96 || metadata.height !== 96 || !metadata.hasAlpha) throw new Error(`Invalid resized image: ${name}`);
  await writeFile(filename, resized);
  results.push({ name, beforeBytes: current.length, afterBytes: resized.length, width: 96, height: 96 });
  thumbnails.push(await sharp(resized).resize(96, 96).png().toBuffer());
}
const composite = thumbnails.map((input, index) => ({ input, left: index % 3 * 112 + 8, top: Math.floor(index / 3) * 112 + 8 }));
const report = {
  size: 96, quality: 85, icons: results,
  beforeBytes: results.reduce((sum, item) => sum + item.beforeBytes, 0),
  afterBytes: results.reduce((sum, item) => sum + item.afterBytes, 0),
};
await mkdir(path.join(root, 'docs/asset-audit'), { recursive: true });
await sharp({ create: { width: 336, height: 336, channels: 4, background: '#18202d' } })
  .composite(composite).png().toFile(path.join(root, 'docs/asset-audit/status-icons-96.png'));
await writeFile(path.join(root, 'docs/asset-audit/status-icons-96.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
