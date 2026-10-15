export const TOONS_HIT_BONUS = 75;
export { TOONS_HIT_COLOR } from './rewardColors.ts';
export const TOONS_HIT_CARDS = [
  { gagIndex: 3, stars: 3, rounds: 3, name: 'Soggy Bottom', image: '/images/sos-cards/soggy-bottom.webp' },
  { gagIndex: 4, stars: 4, rounds: 4, name: 'Soggy Nell', image: '/images/sos-cards/soggy-nell.webp' },
  { gagIndex: 5, stars: 5, rounds: 5, name: 'Sticky Lou', image: '/images/sos-cards/sticky-lou.webp' },
] as const;

type Selection = { trackId: string; gagIndex: number; variant: string } | null;

/** Activation precedes all gags; simultaneous cards refresh duration without stacking accuracy. */
export function getToonsHitRounds(rounds: readonly (readonly Selection[])[]) {
  let remaining = 0;
  return rounds.map(round => {
    for (const gag of round) {
      if (gag?.trackId !== 'toonsHit' || gag.variant !== 'sos') continue;
      const card = TOONS_HIT_CARDS.find(card => card.gagIndex === gag.gagIndex);
      if (card) remaining = Math.max(remaining, card.rounds);
    }
    const active = remaining;
    remaining = Math.max(0, remaining - 1);
    return active;
  });
}
