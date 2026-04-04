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

  const levelMatch = cleanName.match(/Level\s+(\d+)/i) || cleanName.match(/(\d+)$/);
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

  for (const [cog, offset] of Object.entries(offsets)) {
    if (cleanName.includes(cog)) {
      return level + offset;
    }
  }
  return level;
};

export const getAverageSuitValue = (suitNames: string[]) => {
  if (suitNames.length === 0) return 0;
  const suitValues = suitNames.map(name => getCogValueFromName(name));
  return Math.floor(suitValues.reduce((sum, value) => sum + value, 0) / suitValues.length);
};
