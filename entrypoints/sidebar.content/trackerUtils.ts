import type { ToonTrackerData } from './tracker';

export type RewardCategory = 'sos' | 'unites' | 'summons' | 'pinkslips' | 'remotes' | 'analytics';

export type RewardChange = {
  type: RewardCategory;
  subtype: string;
  count: number;
  metadata?: Record<string, any>;
};

export type RewardHistoryEntry = {
  category: RewardCategory;
  item: string;
  amount: number;
  timestamp: number;
  metadata?: Record<string, any>;
  message?: string; // Backward compatibility
};

export const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
export const RECENT_REWARD_LIMIT = 5;
export const REWARD_HIGHLIGHT_MS = 15 * 1000;

export function getRewardHistoryKey(toonId: string): string {
  return `tracker-reward-history-${toonId}`;
}

export function pruneRewardHistory(entries: RewardHistoryEntry[]): RewardHistoryEntry[] {
  const cutoff = Date.now() - THIRTY_DAYS_MS;
  return entries
    .filter((entry) => entry.timestamp >= cutoff)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 500);
}

export function checkRewards(prev: any, next: any, zone?: string | number): RewardChange[] {
  const changes: RewardChange[] = [];
  if (!prev || !next || JSON.stringify(prev) === JSON.stringify(next)) return changes;
  
  const safeZone = String(zone || '');
  const isSellbot = safeZone.includes("Sellbot") || safeZone.includes("Vice President");
  const isCashbot = safeZone.includes("Cashbot") || safeZone.includes("Chief Financial Officer");
  const isLawbot = safeZone.includes("Lawbot") || safeZone.includes("Chief Justice");
  const isBossbot = safeZone.includes("Bossbot") || safeZone.includes("Chief Executive Officer") || safeZone.includes("Clubhouse");
  const isFieldOffice = safeZone.includes("Field Office");

  if (isSellbot && next.sos) {
    Object.entries(next.sos).forEach(([name, count]) => {
      const prevCount = prev.sos?.[name] || 0;
      const delta = (count as number) - prevCount;
      if (delta > 0) changes.push({ type: 'sos', subtype: name.replace(/\u0003/g, ''), count: delta });
    });
  }
  
  if (isCashbot && next.unites) {
    Object.entries(next.unites).forEach(([category, sub]) => {
      Object.entries(sub as any).forEach(([name, count]) => {
        const prevCount = prev.unites?.[category]?.[name] || 0;
        const delta = (count as number) - prevCount;
        if (delta > 0) changes.push({ type: 'unites', subtype: name.replace(/\u0003/g, ''), count: delta, metadata: { uniteCategory: category } });
      });
    });
  }
  
  if (isLawbot && next.summons) {
    Object.entries(next.summons).forEach(([id, summon]: [string, any]) => {
      const prevSummon = prev.summons?.[id];
      const pName = summon.name.replace(/\u0003/g, '');
      if (summon.single && (!prevSummon || !prevSummon.single)) changes.push({ type: 'summons', subtype: pName, count: 1, metadata: { summonType: 'Cog' } });
      if (summon.building && (!prevSummon || !prevSummon.building)) changes.push({ type: 'summons', subtype: pName, count: 1, metadata: { summonType: 'Building' } });
      if (summon.invasion && (!prevSummon || !prevSummon.invasion)) changes.push({ type: 'summons', subtype: pName, count: 1, metadata: { summonType: 'Invasion' } });
    });
  }
  
  if (isBossbot && next.pinkslips) {
    const pinkDelta = next.pinkslips - (prev.pinkslips || 0);
    if (pinkDelta > 0) changes.push({ type: 'pinkslips', subtype: 'Pink Slips', count: pinkDelta });
  }
  
  if (isFieldOffice && next.remotes) {
    Object.entries(next.remotes).forEach(([type, sub]) => {
      Object.entries(sub as any).forEach(([level, count]) => {
        const prevCount = prev.remotes?.[type]?.[level] || 0;
        const delta = (count as number) - prevCount;
        if (delta > 0) changes.push({ type: 'remotes', subtype: type, count: delta, metadata: { remoteType: type, remoteLevel: level } });
      });
    });
  }
  
  return changes;
}

export type RewardGroup = { timestamp: number; entries: RewardHistoryEntry[] };

export function groupRewardHistory(entries: RewardHistoryEntry[]): RewardGroup[] {
  const groups: RewardGroup[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.timestamp === entry.timestamp) {
      last.entries.push(entry);
    } else {
      groups.push({ timestamp: entry.timestamp, entries: [entry] });
    }
  }
  return groups;
}

export function isDeepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return a === b;
  
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!isDeepEqual(a[key], b[key])) return false;
  }
  return true;
}
