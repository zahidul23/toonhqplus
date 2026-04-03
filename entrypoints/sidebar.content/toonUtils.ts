/** Extract toon name from .toon__name text, e.g. "Chimps Mode (111)" -> "Chimps Mode" */
export function extractToonName(raw: string): string {
  return raw.replace(/\s*\(\d+\)\s*$/, '').trim();
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
