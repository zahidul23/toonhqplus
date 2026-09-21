export type OrderableToon = {
  id: string | number;
  name: string;
  laff: number;
};

export function compareToonsByLaffThenName(a: OrderableToon, b: OrderableToon): number {
  if (b.laff !== a.laff) return b.laff - a.laff;
  return a.name.localeCompare(b.name);
}

export function orderTrackerToons<T extends OrderableToon>(
  toons: T[],
  activeToonIds: Iterable<string>,
  customOrder: string[] | null,
): T[] {
  const activeIds = new Set(Array.from(activeToonIds, String));
  const customPositions = customOrder
    ? new Map(customOrder.map((id, index) => [String(id), index]))
    : null;

  const compareWithinStatus = (a: T, b: T) => {
    if (customPositions) {
      const aPosition = customPositions.get(String(a.id));
      const bPosition = customPositions.get(String(b.id));
      if (aPosition !== undefined || bPosition !== undefined) {
        if (aPosition === undefined) return 1;
        if (bPosition === undefined) return -1;
        if (aPosition !== bPosition) return aPosition - bPosition;
      }
    }
    return compareToonsByLaffThenName(a, b);
  };

  return [...toons].sort((a, b) => {
    const activeDifference = Number(activeIds.has(String(b.id))) - Number(activeIds.has(String(a.id)));
    return activeDifference || compareWithinStatus(a, b);
  });
}

export function moveToon(order: string[], draggedId: string, targetId: string, placeAfter = false): string[] {
  if (draggedId === targetId || !order.includes(draggedId) || !order.includes(targetId)) return order;
  const next = order.filter(id => id !== draggedId);
  const targetIndex = next.indexOf(targetId);
  next.splice(targetIndex + (placeAfter ? 1 : 0), 0, draggedId);
  return next;
}
