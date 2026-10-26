import type { NativeUpdate } from './nativeBridge';
import type { ToonRecord, GroupRecord, GroupMemberRecord } from './db';

type Persistence = {
  putToons: (toons: ToonRecord[]) => Promise<void>;
  putGroup: (group: GroupRecord) => Promise<void>;
  putGroupMembers: (members: GroupMemberRecord[]) => Promise<void>;
  deleteGroup: (id: number) => Promise<void>;
  setActiveToonIds: (ids: string[]) => Promise<void>;
};

/** Processes copied native snapshots, never the page's reactive objects. Writes
 * are serialized so a delayed join cannot overwrite a later leave/disband. */
export function createNativeGroupTracker(options: {
  groups: Record<number, any>;
  ownedToons: Record<string, any>;
  toons: Record<string, any>;
  hash: (name: string, photo: string) => string;
  persistence: Persistence;
  onChanged: () => void;
  onError: (error: unknown) => void;
}) {
  const { groups, ownedToons, toons, persistence, hash } = options;
  const signatures = new Map<number, string>();
  // Keep only counts across temporary unavailability so a retried archive can
  // finish saved history after the public active map has been cleared.
  const archiveMemberCounts = new Map<number, number>();
  let ownedSignature = '', disposed = false, writes = Promise.resolve();
  const clear = (object: Record<string, any>) => Object.keys(object).forEach(key => { delete object[key]; });
  const enqueue = (work: () => Promise<void>) => {
    writes = writes.then(work).catch(error => { signatures.clear(); options.onError(error); });
  };
  const normalize = (toon: any): ToonRecord => ({ ...toon,
    id: toon.id != null ? String(toon.id) : hash(toon.name || '', toon.photo || ''),
    hashId: hash(toon.name || '', toon.photo || ''),
    name: toon.name || '', lastSeen: new Date().toISOString(),
  });
  const history = (value: any) => {
    const member = value.members.find((item: any) => item.toon && ownedToons[String(item.toon.id)]);
    if (!member) return;
    const metadata = { groupId: value.id, type: value.type, created: value.created,
      userJoinedAt: member.joined || value.created, options: value.options };
    const members = value.members.filter((item: any) => item.toon).map((item: any) => ({
      groupId: value.id, toonId: String(item.toon.id), joined: item.joined || value.created, left: item.left || null,
    }));
    enqueue(async () => { await persistence.putGroup(metadata); await persistence.putGroupMembers(members); });
  };
  const copyGroup = (value: any) => {
    const copy = JSON.parse(JSON.stringify(value));
    copy.members.forEach((member: any) => { if (member.toon) member.toon = normalize(member.toon); });
    return copy;
  };
  const cache = (value: any) => {
    const records = value.members.filter((member: any) => member.toon).map((member: any) => member.toon);
    for (const toon of records) toons[toon.id] = toon;
    if (records.length) enqueue(() => persistence.putToons(records));
  };
  return {
    apply(update: NativeUpdate) {
      if (disposed) return;
      if (!update.state.available) {
        clear(groups); clear(ownedToons); signatures.clear(); ownedSignature = '';
        options.onChanged(); return;
      }
      const owned = update.state.authenticated ? update.state.ownedToons.filter(toon => toon.game === 1) : [];
      const nextOwnedSignature = JSON.stringify(owned);
      const ownershipChanged = nextOwnedSignature !== ownedSignature;
      if (ownershipChanged) {
        ownedSignature = nextOwnedSignature;
        clear(ownedToons);
        const records = owned.map(normalize);
        records.forEach(toon => { ownedToons[toon.id] = toon; toons[toon.id] = toon; });
        enqueue(async () => {
          if (records.length) await persistence.putToons(records);
          await persistence.setActiveToonIds(records.map(toon => toon.id));
        });
      }
      if (!update.state.connected || update.state.gameId !== 1) {
        clear(groups); signatures.clear(); archiveMemberCounts.clear(); options.onChanged(); return;
      }
      for (const value of update.archived) {
        const count = archiveMemberCounts.get(value.id);
        if (count === undefined) continue;
        if (count <= 2) enqueue(() => persistence.deleteGroup(value.id));
        else { const copy = copyGroup(value); cache(copy); history(copy); }
        delete groups[value.id]; signatures.delete(value.id); archiveMemberCounts.delete(value.id);
      }
      if (update.full) {
        const active = new Set(update.groups.map(value => value.id));
        for (const key of Object.keys(groups)) {
          if (!active.has(Number(key))) { delete groups[Number(key)]; signatures.delete(Number(key)); }
        }
        for (const id of archiveMemberCounts.keys()) {
          if (!active.has(id)) archiveMemberCounts.delete(id);
        }
      }
      if (ownershipChanged) {
        const touched = new Set(update.groups.map(value => value.id));
        Object.values(groups).forEach(value => { if (!touched.has(value.id)) history(value); });
      }
      for (const value of update.groups) {
        archiveMemberCounts.set(value.id, value.members.filter((member: any) => !member.left).length);
        const signature = JSON.stringify(value);
        if (signatures.get(value.id) === signature) {
          if (ownershipChanged) history(groups[value.id]);
          continue;
        }
        signatures.set(value.id, signature);
        const copy = copyGroup(value);
        groups[value.id] = copy;
        cache(copy); history(copy);
      }
      options.onChanged();
    },
    settled() { return writes; },
    dispose() { disposed = true; clear(groups); clear(ownedToons); signatures.clear(); archiveMemberCounts.clear(); },
  };
}
