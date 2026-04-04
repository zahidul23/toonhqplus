import { getCogValueFromName, getAverageSuitValue, getGroupDisplayName, getGroupSimpleName } from './toonUtils';

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

  const groupDisplayNameTests = [
    { typeId: 28, groupId: 123, expected: 'CEO' },
    { typeId: 22, groupId: 456, expected: 'VP' },
    { typeId: 20, groupId: 789, expected: 'Building' },
    { typeId: 20, groupId: 789, options: { '16': 50, '17': 55 }, expected: 'One Story Sellbot Building' },
    { typeId: 23, groupId: 111, options: { '22': 69, '23': 70 }, expected: 'Bullion Sound Mint' },
    { typeId: 999, groupId: 101, expected: 'Group #101' },
    { typeId: 999, expected: 'Unknown Group' },
  ];

  console.log('\n[getGroupDisplayName Tests]');
  groupDisplayNameTests.forEach(({ typeId, groupId, options, expected }) => {
    const actual = getGroupDisplayName(typeId, groupId, options as any);
    const passed = actual === expected;
    console.log(`${passed ? 'PASS' : 'FAIL'} | type ${typeId}, id ${groupId}, options ${JSON.stringify(options)} -> expected "${expected}", got "${actual}"`);
  });

  const groupSimpleNameTests = [
    { typeId: 28, groupId: 123, options: { 30: 95 }, expected: 'Tier 1 CEO' },
    { typeId: 20, groupId: 789, options: { 17: 55 }, expected: 'Sellbot Building' },
    { typeId: 20, groupId: 789, options: { 16: 50, 17: 55 }, expected: 'Sellbot Building' }, // Stories showOnSimple=false
    { typeId: 46, groupId: 222, options: { 41: 125 }, expected: 'One Star Field Office' }, // Field Office simpleName override
    { typeId: 999, groupId: 101, expected: 'Group #101' },
  ];

  console.log('\n[getGroupSimpleName Tests]');
  groupSimpleNameTests.forEach(({ typeId, groupId, options, expected }) => {
    const actual = getGroupSimpleName(typeId, groupId, options as any);
    const passed = actual === expected;
    console.log(`${passed ? 'PASS' : 'FAIL'} | type ${typeId}, id ${groupId}, options ${JSON.stringify(options)} -> expected "${expected}", got "${actual}"`);
  });

  console.log('\n--- Tests Completed ---');
}

// Run tests if this file is executed directly
if (typeof process !== 'undefined') {
  runTests();
}
