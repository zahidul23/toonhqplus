import { cogs } from '../sidebar.content/cogs';
import { gags } from '../sidebar.content/gags';
import type { RewardChange } from '../sidebar.content/trackerUtils';

// Chrome recommends a 192 px notification icon. Render at 2x first so text and
// outlines receive a softer antialiased downsample before Chrome displays them.
const SIZE = 192;
const RENDER_SIZE = SIZE * 2;
const DESIGN_SIZE = 256;
const TOONHQ_ASSETS = 'https://toonhq.org/static/assets';
let mickeyFontPromise: Promise<boolean> | undefined;

function assetUrl(path: string) {
  return browser.runtime.getURL(path as any);
}

async function loadImage(url: string): Promise<ImageBitmap | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await createImageBitmap(await response.blob());
  } catch {
    return null;
  }
}

function loadMickeyNumbersFont() {
  mickeyFontPromise ??= (async () => {
    try {
      const responses = await Promise.all([
        fetch(assetUrl('fonts/MickeyFont-numbers.ttf')),
        fetch(assetUrl('fonts/MickeyFont-numbers-fill.ttf')),
      ]);
      if (responses.some(response => !response.ok)) return false;
      const fonts = await Promise.all([
        new FontFace('MickeyNumbers', await responses[0].arrayBuffer()).load(),
        new FontFace('MickeyNumbersFill', await responses[1].arrayBuffer()).load(),
      ]);
      // Chrome MV3 exposes the worker FontFaceSet on self, while Firefox MV2
      // runs this background script in a document and exposes document.fonts.
      const fontSet: FontFaceSet | undefined = (self as any).fonts ?? (globalThis as any).document?.fonts;
      if (!fontSet) return false;
      for (const font of fonts) fontSet.add(font);
      // Each face is already loaded. Waiting for the entire set's ready promise
      // can stall icon generation in Chrome's background worker.
      return true;
    } catch {
      return false;
    }
  })();
  return mickeyFontPromise;
}

function drawMickeyLabel(
  ctx: OffscreenCanvasRenderingContext2D,
  amount: string,
  fillColor: string,
  outlineColor: string,
) {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  const families = ['MickeyNumbers, Arial Black, Arial', 'MickeyNumbersFill, Arial Black, Arial'];
  const text = `+${amount}`;
  const boundsAt = (size: number) => {
    const metrics = families.map(family => {
      ctx.font = `${size}px ${family}`;
      return ctx.measureText(text);
    });
    const left = Math.max(...metrics.map(metric => metric.actualBoundingBoxLeft ?? 0));
    const right = Math.max(...metrics.map(metric => metric.actualBoundingBoxRight ?? metric.width));
    const ascent = Math.max(...metrics.map(metric => metric.actualBoundingBoxAscent ?? size * 0.8));
    const descent = Math.max(...metrics.map(metric => metric.actualBoundingBoxDescent ?? size * 0.2));
    return { left, width: left + right, ascent, height: ascent + descent };
  };
  const initial = boundsAt(224);
  // Fit the ink of both font layers, rather than their advance width or the
  // font's "top" baseline, which can leave these glyphs above the canvas.
  const size = 224 * Math.min(1, (DESIGN_SIZE - 32) / initial.width, 72 / initial.height);
  const bounds = boundsAt(size);
  const x = (DESIGN_SIZE - bounds.width) / 2 + bounds.left;
  const y = 8 + bounds.ascent;
  // The companion font contains solid glyph silhouettes while MickeyNumbers
  // retains the original outlined bands, so both colors remain independent.
  ctx.fillStyle = fillColor;
  ctx.font = `${size}px ${families[1]}`;
  ctx.fillText(text, x, y);
  ctx.fillStyle = outlineColor;
  ctx.font = `${size}px ${families[0]}`;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawContained(ctx: OffscreenCanvasRenderingContext2D, image: ImageBitmap, x: number, y: number, width: number, height: number) {
  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function summonBadgeSvg(type: string) {
  const label = type === 'Building' ? 'BLDG' : type === 'Invasion' ? 'INV' : 'COG';
  const symbol = type === 'Building'
    ? '<path d="M17 46V17h30v29M12 46h40M24 25h6m7 0h5m-18 9h6m7 0h5"/>'
    : type === 'Invasion'
      ? '<path d="M15 34h10l20 10V14L25 24H15zm9 0 4 14h8l-5-14"/>'
      : '<circle cx="32" cy="28" r="14"/><path d="M20 45h24M25 25h1m12 0h1M26 34h12"/>';
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#111827"/><g fill="none" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${symbol}</g><text x="32" y="59" fill="white" font-family="Arial" font-weight="700" font-size="8" text-anchor="middle">${label}</text></svg>`)}`;
}

function getCogImage(name: string) {
  const rank = cogs.flatMap(suit => suit.ranks).find(cog => cog.name === name);
  return rank ? `${TOONHQ_ASSETS}/cogs/${rank.image}` : assetUrl('images/summons.webp');
}

function getGagUpImage(name: string) {
  const cleanName = name.replace(/[\u0000-\u001f]/g, '').trim();
  const track = gags.find(candidate => cleanName.toLowerCase().endsWith(candidate.name.toLowerCase()));
  const slug = track ? track.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'all';
  return assetUrl(`images/unites/gag-up-${slug}.webp`);
}

function getPrimaryImage(change: RewardChange) {
  if (change.type === 'sos') {
    const imageName = change.subtype.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return assetUrl(`images/sos-cards/${imageName}.webp`);
  }
  if (change.type === 'summons') return getCogImage(change.subtype);
  if (change.type === 'unites' && change.metadata?.uniteCategory === 'Gag-Up') return getGagUpImage(change.subtype);
  if (change.type === 'unites' && change.metadata?.uniteCategory === 'Jellybeans') return assetUrl('images/unites/jellybean-jar.webp');
  if (change.type === 'unites' && change.metadata?.uniteCategory === 'Toon-Up') {
    return assetUrl('images/unites/pixie-dust.webp');
  }
  if (change.type === 'remotes' && /heal/i.test(change.subtype)) return assetUrl('images/remotesheal.webp');
  const names: Record<string, string> = {
    sos: 'sos.webp', unites: 'unites.webp', summons: 'summons.webp', pinkslips: 'pinkslips.webp', remotes: 'remotes.webp',
  };
  return assetUrl(`images/${names[change.type] || 'sos.webp'}`);
}

async function blobToDataUrl(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

export async function createRewardNotificationIcon(change: RewardChange): Promise<string> {
  if (change.type === 'unites') {
    const amount = Number(change.subtype.match(/\d+/)?.[0]);
    const category = change.metadata?.uniteCategory;
    if (category === 'Toon-Up' && [20, 35, 50, 65, 80].includes(amount)) {
      return assetUrl(`images/unites/toon-up-${amount}.webp`);
    }
    if (category === 'Jellybeans' && [100, 200, 350, 600].includes(amount)) {
      return assetUrl(`images/unites/jellybeans-${amount}.webp`);
    }
  }
  try {
    return await renderRewardNotificationIcon(change);
  } catch (error) {
    console.warn('[ToonHQ+] Could not render reward notification icon; using the reward image.', error);
    return getPrimaryImage(change);
  }
}

// Also used by the offline icon generator. Unknown amounts retain this renderer.
export async function renderRewardNotificationIcon(change: RewardChange): Promise<string> {
  if (change.type === 'unites' && change.metadata?.uniteCategory === 'Gag-Up') return getPrimaryImage(change);
  if (typeof OffscreenCanvas === 'undefined') return getPrimaryImage(change);
  const canvas = new OffscreenCanvas(RENDER_SIZE, RENDER_SIZE);
  const ctx = canvas.getContext('2d');
  if (!ctx) return getPrimaryImage(change);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.scale(RENDER_SIZE / DESIGN_SIZE, RENDER_SIZE / DESIGN_SIZE);
  ctx.clearRect(0, 0, DESIGN_SIZE, DESIGN_SIZE);
  const [primary, badge] = await Promise.all([
    loadImage(getPrimaryImage(change)),
    change.type === 'summons' ? loadImage(summonBadgeSvg(change.metadata?.summonType || 'Cog')) : Promise.resolve(null),
  ]);

  if (primary) {
    if (change.type === 'unites' && (change.metadata?.uniteCategory === 'Jellybeans' || change.metadata?.uniteCategory === 'Toon-Up')) {
      drawContained(ctx, primary, 46, 82, 164, 164);
    } else {
      drawContained(ctx, primary, 10, 10, 236, 236);
    }
  }

  if (change.type === 'unites' && change.metadata?.uniteCategory === 'Toon-Up') {
    const amount = String(change.subtype).match(/\d+/)?.[0] || change.subtype;
    await loadMickeyNumbersFont();
    drawMickeyLabel(ctx, amount, '#4ade80', '#166534');
  }

  if (change.type === 'unites' && change.metadata?.uniteCategory === 'Jellybeans') {
    const amount = change.subtype.match(/\d+/)?.[0];
    if (amount) {
      await loadMickeyNumbersFont();
      drawMickeyLabel(ctx, amount, '#f2f200', '#66751f');
    }
  }

  if (badge) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(8, 180, 68, 68, 14);
    ctx.clip();
    ctx.drawImage(badge, 8, 180, 68, 68);
    ctx.restore();
  }

  const output = new OffscreenCanvas(SIZE, SIZE);
  const outputCtx = output.getContext('2d');
  if (!outputCtx) return getPrimaryImage(change);
  outputCtx.imageSmoothingEnabled = true;
  outputCtx.imageSmoothingQuality = 'high';
  outputCtx.drawImage(canvas, 0, 0, SIZE, SIZE);
  return blobToDataUrl(await output.convertToBlob({ type: 'image/png' }));
}
