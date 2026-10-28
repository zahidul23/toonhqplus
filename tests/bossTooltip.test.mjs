import test from 'node:test';
import assert from 'node:assert/strict';
import { renderBossTooltip, bossTooltipClass } from '../entrypoints/sidebar.content/bossTooltip.ts';

const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

test('CEO tooltip leads with pink slips and labels the group average', () => {
  const html = text(renderBossTooltip({ boss: 'CEO', average: 48, averageName: 'The Big Cheese 20', sum: 336, toonCount: 7 }));
  assert.match(html, /^5 Pink Slips Tier 4\/5 Group Average The Big Cheese 20 Feeding Round Timer 315s Tables 12 Total Cogs 60 Cog Types/);
  assert.match(html, /Pink Slip Thresholds The Big Cheese 20\+ 5 Slips The Big Cheese 20\+ required to maintain/);
});

test('CJ tooltip shows lawyers, evidence stats and notes', () => {
  const html = text(renderBossTooltip({ boss: 'CJ', average: 30, averageName: 'Spin Doctor 10', sum: 120, toonCount: 4 }));
  assert.match(html, /^8 Lawyers Tier 4\/9 Group Average Spin Doctor 10 Evidence Round Gavels 6 Evidence Count 32 Evidence Heal 2 Laff Bonus Weight No/);
  assert.match(html, /Lawyer Thresholds Big Wig 42\+ 10 Lawyers Impossible to reach with 8 members/);
  assert.equal(bossTooltipClass('CJ'), 'toonhq-plus-boss-tip toonhq-plus-boss-tip--lawbot');
});
