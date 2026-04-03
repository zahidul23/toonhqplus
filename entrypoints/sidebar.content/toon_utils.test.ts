import { getCogValueFromName, getAverageSuitValue } from './toonUtils';

/**
 * Simple test runner for ToonUtils.
 * You can run this file with 'npx tsx entrypoints/sidebar.content/toon_utils.test.ts'
 */

function runTests() {
  console.log('--- Running ToonUtils Tests ---');

  const cogValueTests = [
    { name: 'Bottom Feeder Level 5', expected: 5 },
    { name: 'Pencil Pusher Level 10', expected: 14 }, // 4 offset + 10
    { name: 'The Big Cheese Level 50', expected: 78 }, // 28 offset + 50
    { name: 'Big Wig Level 45', expected: 73 }, // 28 offset + 45
    { name: 'Legal Eagle Level 12', expected: 36 }, // 24 offset + 12
    { name: 'Spin Doctor Level 20', expected: 40 }, // 20 offset + 20
    { name: 'YESMAN Level 10', expected: 18 }, // Case insensitive (if it works) - wait, code didn't use i flag for cog names
    { name: 'Some Cog 2.0', expected: 78 },
    { name: 'Level 12', expected: 12 },
    { name: 'Random Toon (50)', expected: 50 }, // Matches (\d+)$
  ];

  console.log('\n[getCogValueFromName Tests]');
  cogValueTests.forEach(({ name, expected }) => {
    const actual = getCogValueFromName(name);
    const passed = actual === expected;
    console.log(`${passed ? 'PASS' : 'FAIL'} | "${name}" -> expected ${expected}, got ${actual}`);
  });

  const averageValueTests = [
    {
      names: ['Bottom Feeder Level 5', 'Pencil Pusher Level 10'],
      expected: Math.round((5 + 14) / 2), // 19 / 2 = 9.5 -> 10
    },
    {
      names: ['The Big Cheese Level 50', 'Big Wig Level 45', 'Bottom Feeder Level 5'],
      expected: Math.round((78 + 73 + 5) / 3), // 156 / 3 = 52
    },
    {
      names: [
        'The Big Cheese Level 18',
        'The Big Cheese Level 46',
        'The Big Cheese Level 46',
        'The Big Cheese Level 50',
        'Micromanager Level 50 v2.0',
        'Corporate Raider Level 50 v2.0',
        'Corporate Raider Level 8',
        'The Big Cheese Level 12'
      ],
      expected: 62, // 46 + 74 + 74 + 78 + 78 + 78 + 32 + 40 = 500 / 8 = 62.5 -> 62
    },
    {
      names: [],
      expected: 0
    }
  ];

  console.log('\n[getAverageSuitValue Tests]');
  averageValueTests.forEach(({ names, expected }) => {
    const actual = getAverageSuitValue(names);
    const passed = actual === expected;
    console.log(`${passed ? 'PASS' : 'FAIL'} | [${names.join(', ')}] -> expected ${expected}, got ${actual}`);
  });

  console.log('\n--- Tests Completed ---');
}

// Run tests if this file is executed directly
if (typeof process !== 'undefined') {
  runTests();
}
