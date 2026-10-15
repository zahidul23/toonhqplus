type GagVariant = 'base' | 'organic' | 'sos';

type EncodedGag = {
  trackId: string;
  gagIndex: number;
  variant: GagVariant;
};

type EncodedCogGag = EncodedGag & {
  target: 'single' | 'all';
  targetIdx?: number;
};

const TRACK_IDS = ['trap', 'lure', 'sound', 'throw', 'squirt', 'drop', 'special', 'toonsHit'] as const;
const VARIANTS = ['base', 'organic', 'sos'] as const;
const EMPTY_GAG_CODE = '00';

const trackToIndex = new Map<string, number>(TRACK_IDS.map((trackId, index) => [trackId, index]));
const variantToIndex = new Map<GagVariant, number>(VARIANTS.map((variant, index) => [variant, index]));

function toHexByte(value: number) {
  return value.toString(16).padStart(2, '0');
}

function encodeGagCode(gag: EncodedGag | null) {
  if (!gag) return EMPTY_GAG_CODE;

  const trackIndex = trackToIndex.get(gag.trackId);
  const variantIndex = variantToIndex.get(gag.variant);
  if (trackIndex == null || variantIndex == null || gag.gagIndex < 0 || gag.gagIndex > 7) {
    return EMPTY_GAG_CODE;
  }

  const packedValue = (trackIndex << 5) | (variantIndex << 3) | gag.gagIndex;
  return toHexByte(packedValue + 1);
}

function decodeGagCode(code: string): EncodedGag | null {
  if (code.length !== 2 || code === EMPTY_GAG_CODE) return null;

  const packedValue = Number.parseInt(code, 16) - 1;
  if (Number.isNaN(packedValue) || packedValue < 0) return null;

  const trackIndex = packedValue >> 5;
  const variantIndex = (packedValue >> 3) & 0b11;
  const gagIndex = packedValue & 0b111;

  const trackId = TRACK_IDS[trackIndex];
  const variant = VARIANTS[variantIndex];
  if (!trackId || !variant) return null;

  return { trackId, gagIndex, variant };
}

function encodeTargetDigit(gag: EncodedCogGag | null) {
  if (!gag) return '0';
  if (gag.target === 'all') return '5';
  if (typeof gag.targetIdx !== 'number' || gag.targetIdx < 0 || gag.targetIdx > 3) return '0';
  return String(gag.targetIdx + 1);
}

function decodeTargetDigit(digit: string): Pick<EncodedCogGag, 'target' | 'targetIdx'> {
  if (digit === '5') return { target: 'all' };

  const parsed = Number.parseInt(digit, 10);
  if (Number.isNaN(parsed) || parsed < 1 || parsed > 4) {
    return { target: 'single', targetIdx: 0 };
  }

  return { target: 'single', targetIdx: parsed - 1 };
}

function trimTrailingPairs(value: string) {
  return value.replace(/(?:00)+$/g, '');
}

function trimTrailingZeroes(value: string) {
  return value.replace(/0+$/g, '');
}

export function encodeBoilerGridToSearch(grid: Array<Array<EncodedGag | null>>) {
  const gagCodes = trimTrailingPairs(grid.flat().map(encodeGagCode).join(''));
  return gagCodes;
}

export function decodeBoilerGridFromSearch(
  gagCodes: string,
  totalSlots: number,
): Array<Array<EncodedGag | null>> {
  const flat = Array.from({ length: totalSlots }, (_, index) => {
    const start = index * 2;
    const code = gagCodes.slice(start, start + 2);
    return decodeGagCode(code);
  });

  const rows: Array<Array<EncodedGag | null>> = [];
  for (let index = 0; index < flat.length; index += 4) {
    rows.push(flat.slice(index, index + 4));
  }
  return rows;
}

export function encodeCogRoundsToSearch(rounds: Array<Array<EncodedCogGag | null>>) {
  const flattened = rounds.flat();
  const gagCodes = trimTrailingPairs(flattened.map(encodeGagCode).join(''));
  const targetCodes = trimTrailingZeroes(flattened.map(encodeTargetDigit).join(''));

  return { gagCodes, targetCodes };
}

export function decodeCogRoundsFromSearch(
  gagCodes: string,
  targetCodes: string,
  totalSlots: number,
): Array<Array<EncodedCogGag | null>> {
  const flat = Array.from({ length: totalSlots }, (_, index) => {
    const gagCode = gagCodes.slice(index * 2, index * 2 + 2);
    const gag = decodeGagCode(gagCode);
    if (!gag) return null;

    const target = decodeTargetDigit(targetCodes[index] ?? '0');
    return {
      ...gag,
      ...target,
    };
  });

  const rounds: Array<Array<EncodedCogGag | null>> = [];
  for (let index = 0; index < flat.length; index += 4) {
    rounds.push(flat.slice(index, index + 4));
  }
  return rounds;
}

