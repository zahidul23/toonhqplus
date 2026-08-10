import { groupTypes } from './groupTypes';
import { GROUP_CONFIG } from './groupConfig';

/** Get a group's simple name, e.g. "Sellbot Building" (if Sellbot is showOnSimple) or just "Building" */
export function getGroupSimpleName(typeId: number, groupId?: number, options?: Record<string, number>): string {
  const config = GROUP_CONFIG[typeId];
  const typeData = (groupTypes as any[]).find(t => t.id === typeId);
  
  if (!typeData) return groupId ? `Group #${groupId}` : 'Unknown Group';

  const prefixes: string[] = [];
  const suffixes: string[] = [];

  if (options && config && Array.isArray(typeData.options)) {
    typeData.options.forEach((opt: any) => {
      const showOnSimple = config.options[opt.id]?.showOnSimple ?? false;
      if (!showOnSimple) return;

      const valueId = options[String(opt.id)];
      if (valueId !== undefined) {
        const val = opt.values.find((v: any) => v.id === valueId);
        if (val) {
          if (val.prefix) prefixes.push(val.name);
          else suffixes.push(val.name);
        }
      }
    });
  }

  let finalName = config?.simpleName || typeData.name;
  if (prefixes.length > 0) finalName = `${prefixes.join(' ')} ${finalName}`;
  if (suffixes.length > 0) finalName = `${finalName} ${suffixes.join(' ')}`;

  return finalName;
}

/** Extract toon name from .toon__name text, e.g. "Chimps Mode (111)" -> "Chimps Mode" */
export function extractToonName(raw: string): string {
  return raw.replace(/\s*\(\d+\)\s*$/, '').trim();
}

/** Get a group's display name, e.g. "CEO" or "Group #1234" */
export function getGroupDisplayName(typeId: number, groupId?: number, options?: Record<string, number>): string {
  const type = (groupTypes as any[]).find(t => t.id === typeId);
  if (!type) return groupId ? `Group #${groupId}` : 'Unknown Group';

  const prefixes: string[] = [];
  const suffixes: string[] = [];

  if (options && Array.isArray(type.options)) {
    type.options.forEach((opt: any) => {
      const valueId = options[String(opt.id)];
      if (valueId !== undefined) {
        const val = opt.values.find((v: any) => v.id === valueId);
        if (val) {
          if (val.prefix) {
            prefixes.push(val.name);
          } else {
            suffixes.push(val.name);
          }
        }
      }
    });
  }

  let finalName = type.name;
  if (prefixes.length > 0) {
    finalName = `${prefixes.join(' ')} ${finalName}`;
  }
  if (suffixes.length > 0) {
    finalName = `${finalName} ${suffixes.join(' ')}`;
  }

  return finalName;
}

export const getCogValueFromName = (name: string) => {
  const cleanName = name.replace(/<[^>]*>?/gm, ' ');
  if (cleanName.includes("2.0")) return 78;

  const levelMatch = cleanName.match(/Level\s+(\d+)/i) || cleanName.match(/(\d+)\s*\)?$/);
  const level = levelMatch ? parseInt(levelMatch[1]) : 1;

  const offsets = {
    "Bottom Feeder": 0, "Flunky": 0,
    "Bloodsucker": 4, "Pencil Pusher": 4,
    "Double Talker": 8, "Yesman": 8,
    "Ambulance Chaser": 12, "Micromanager": 12,
    "Back Stabber": 16, "Downsizer": 16,
    "Spin Doctor": 20, "Head Hunter": 20,
    "Legal Eagle": 24, "Corporate Raider": 24,
    "Big Wig": 28, "The Big Cheese": 28,
  };

  const lowerName = cleanName.toLowerCase();
  for (const [cog, offset] of Object.entries(offsets)) {
    if (lowerName.includes(cog.toLowerCase())) {
      return level + offset;
    }
  }
  return level;
};

/** Decode ToonHQ's four-character TTR disguise value and return its suit level. */
export function getToonSuitLevel(suitCode: unknown): number {
  if (suitCode == null || suitCode === '') return 0;

  if (typeof suitCode === 'object') {
    const suit = suitCode as Record<string, unknown>;
    if (suit.version === 2 || suit.prestiged === true || suit.prestige === true) return 50;
    const objectLevel = Number(suit.level);
    return Number.isFinite(objectLevel) ? objectLevel : 0;
  }

  const raw = String(suitCode).trim();
  if (/2\.0|prestig/i.test(raw)) return 50;

  // ToonHQ encodes disguise data as: cog-rank hex, version digit, level hex.
  const encoded = raw.padStart(4, '0');
  if (encoded.length >= 4 && /^[0-9a-f]+$/i.test(encoded)) {
    if (encoded[1] === '2') return 50;
    const cogIndex = parseInt(encoded[0], 16) - 1;
    if (cogIndex < 0) return 0;
    const decodedLevel = parseInt(encoded.slice(2), 16);
    return Number.isFinite(decodedLevel) ? decodedLevel : 0;
  }

  const directLevel = Number(raw);
  return Number.isFinite(directLevel) ? directLevel : 0;
}

export function bankersRound(num: number): number {
  const half = Math.floor(num) + 0.5;
  if (Math.abs(num - half) < 0.000001) {
    const floor = Math.floor(num);
    return (floor % 2 === 0) ? floor : floor + 1;
  }
  return Math.round(num);
}

export const getAverageSuitValue = (suitNames: string[]) => {
  if (suitNames.length === 0) return 0;
  const suitValues = suitNames.map(name => getCogValueFromName(name));
  return bankersRound(suitValues.reduce((sum, value) => sum + value, 0) / suitValues.length);
};
