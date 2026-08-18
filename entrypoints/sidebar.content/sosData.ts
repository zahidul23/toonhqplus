export const SOS_DATA: Record<string, { type: string; starRating: number; notificationType?: string }> = {
  'Lord Lowden Clear': { type: 'Fire', starRating: 5 },
  'Professor Pete': { type: 'Restock', notificationType: 'Restock All', starRating: 5 },
  'Professor Guffaw': { type: 'Restock', notificationType: 'Restock Toon-Up', starRating: 3 },
  'Clerk Ray': { type: 'Restock', notificationType: 'Restock Trap', starRating: 3 },
  'Doctor Drift': { type: 'Restock', notificationType: 'Restock Lure', starRating: 3 },
  'Melody Wavers': { type: 'Restock', notificationType: 'Restock Sound', starRating: 3 },
  'Shelly Seaweed': { type: 'Restock', notificationType: 'Restock Drop', starRating: 3 },
  'Rocky': { type: 'Throw', starRating: 5 },
  'Sticky Lou': { type: 'Toons Hit', starRating: 5 },
  'Julius Wheezer': { type: 'Cogs Miss', starRating: 5 },
  'Flippy': { type: 'Toon Up', starRating: 5 },
  'Clerk Clara': { type: 'Trap', starRating: 5 },
  'Lil Oldman': { type: 'Lure', starRating: 5 },
  'Nancy Gas': { type: 'Lure', starRating: 4 },
  'Barnacle Bessie': { type: 'Drop', starRating: 5 },
  'Baker Bridget': { type: 'Restock', notificationType: 'Restock Throw', starRating: 3 },
  'Soggy Nell': { type: 'Toons Hit', starRating: 4 },
  'Mr. Freeze': { type: 'Cogs Miss', starRating: 4 },
  'Daffy Don': { type: 'Toon Up', starRating: 4 },
  'Clerk Penny': { type: 'Trap', starRating: 4 },
  'Stinky Ned': { type: 'Lure', starRating: 3 },
  'Moe Zart': { type: 'Sound', starRating: 5 },
  'Franz Neckvein': { type: 'Drop', starRating: 4 },
  'Sofie Squirt': { type: 'Restock', notificationType: 'Restock Squirt', starRating: 3 },
  'Soggy Bottom': { type: 'Toons Hit', starRating: 3 },
  'Flim Flam': { type: 'Cogs Miss', starRating: 3 },
  'Madam Chuckle': { type: 'Toon Up', starRating: 3 },
  'Clerk Will': { type: 'Trap', starRating: 3 },
  'Sid Sonata': { type: 'Sound', starRating: 4 },
  'Barbara Seville': { type: 'Sound', starRating: 3 },
  'Clumsy Ned': { type: 'Drop', starRating: 3 },
  'Loopy Loopenloop': { type: 'Squirt', starRating: 5 },
};

export function formatSosReward(name: string) {
  const cleanName = name.replace(/[\u0000-\u001f]/g, '').trim();
  const canonicalName = Object.keys(SOS_DATA).find(key => key.toLowerCase() === cleanName.toLowerCase()) || cleanName;
  const reward = SOS_DATA[canonicalName];
  return reward ? `${canonicalName}\n${reward.starRating} Star ${reward.notificationType || reward.type}` : canonicalName;
}
