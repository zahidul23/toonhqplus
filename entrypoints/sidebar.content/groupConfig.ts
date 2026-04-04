/** Condensed map of group types and their options with metadata for display logic. */
export const GROUP_CONFIG: Record<number, {
  name: string,
  simpleName?: string,
  options: Record<number, {
    name: string,
    showOnSimple: boolean
  }>
}> = {
  // Game 1 (TTR)
  1: { // Building
    name: "Building",
    options: {
      1: { name: "Stories", showOnSimple: true },
      2: { name: "Cog Type", showOnSimple: true },
      45: { name: "Training", showOnSimple: false }
    }
  },
  2: { // Factory
    name: "Factory",
    options: {
      3: { name: "Length", showOnSimple: false },
      4: { name: "Type", showOnSimple: true },
      5: { name: "Gags", showOnSimple: false }
    }
  },
  3: { // VP
    name: "VP",
    options: {
      6: { name: "Shopping", showOnSimple: true }
    }
  },
  4: { // Mint
    name: "Mint",
    options: {
      7: { name: "Type", showOnSimple: true },
      8: { name: "Gags", showOnSimple: false },
      47: { name: "Length", showOnSimple: false }
    }
  },
  5: { name: "CFO", options: {} },
  6: { // DA Office
    name: "DA Office",
    options: {
      9: { name: "Wing", showOnSimple: true },
      48: { name: "Length", showOnSimple: false }
    }
  },
  7: { name: "CJ", options: {} },
  8: { // Cog Golf Course
    name: "Cog Golf Course",
    options: {
      10: { name: "Course", showOnSimple: true },
      49: { name: "Length", showOnSimple: false }
    }
  },
  9: { name: "CEO", options: {} },
  10: { name: "Beanfest", options: {} },
  11: { name: "Toontask", options: {} },
  12: { // Gag Training
    name: "Gag Training",
    options: {
      11: { name: "Type", showOnSimple: true }
    }
  },
  13: { // Kart Racing
    name: "Kart Racing",
    options: {
      13: { name: "Type", showOnSimple: true }
    }
  },
  14: { // Golfing
    name: "Chip 'n Dale Golfing",
    simpleName: "Golfing",
    options: {
      14: { name: "Type", showOnSimple: true },
      50: { name: "Difficulty", showOnSimple: false }
    }
  },
  15: { name: "Trolley", options: {} },
  16: { // Table Game
    name: "Table Game",
    options: {
      12: { name: "Type", showOnSimple: true }
    }
  },
  17: { // Doodle Training
    name: "Doodle Training",
    options: {
      42: { name: "Trick", showOnSimple: true }
    }
  },
  18: { name: "Party", options: {} },
  66: { name: "Building Marathon", options: {} },
  68: { name: "Fishing", options: {} },

  // Game 2 (Corporate Clash)
  20: { // Building
    name: "Building",
    options: {
      16: { name: "Stories", showOnSimple: false },
      17: { name: "Cog Type", showOnSimple: true },
      46: { name: "Training", showOnSimple: false }
    }
  },
  21: { // Factory
    name: "Factory",
    options: {
      18: { name: "Length", showOnSimple: true },
      19: { name: "Entrance", showOnSimple: false },
      20: { name: "Gags", showOnSimple: false },
      40: { name: "Battles", showOnSimple: false }
    }
  },
  22: { // VP
    name: "VP",
    options: {
      32: { name: "Boss Tier", showOnSimple: true }
    }
  },
  23: { // Mint
    name: "Mint",
    options: {
      22: { name: "Type", showOnSimple: true },
      23: { name: "Gags", showOnSimple: false },
      34: { name: "Length", showOnSimple: true }
    }
  },
  24: { // CFO
    name: "CFO",
    options: {
      31: { name: "Boss Tier", showOnSimple: true }
    }
  },
  25: { // Lawfice
    name: "Lawfice",
    options: {
      24: { name: "Office", showOnSimple: true },
      35: { name: "Length", showOnSimple: true }
    }
  },
  26: { // CLO
    name: "CLO",
    options: {
      33: { name: "Boss Tier", showOnSimple: true }
    }
  },
  27: { // Cog Golf Course
    name: "Cog Golf Course",
    options: {
      25: { name: "Course", showOnSimple: true },
      36: { name: "Length", showOnSimple: true }
    }
  },
  28: { // CEO
    name: "CEO",
    options: {
      30: { name: "Boss Tier", showOnSimple: true }
    }
  },
  31: { // Gag Training
    name: "Gag Training",
    options: {
      26: { name: "Type", showOnSimple: true }
    }
  },
  32: { // Kart Racing
    name: "Kart Racing",
    options: {
      28: { name: "Type", showOnSimple: true }
    }
  },
  33: { // Golfing
    name: "Golfing",
    options: {
      29: { name: "Type", showOnSimple: true }
    }
  },
  34: { name: "Trolley", options: {} },
  38: { name: "Fishing", options: {} },
  39: { name: "Derrick Man", options: {} },
  40: { name: "Director of Land Acquisition", options: {} },
  41: { name: "Director of Public Relations", options: {} },
  42: { name: "Director of Public Affairs", options: {} },
  44: { // Table Game
    name: "Table Game",
    options: {
      38: { name: "Type", showOnSimple: true }
    }
  },
  46: { // Sellbot Field Office
    name: "Sellbot Field Office",
    simpleName: "Field Office",
    options: {
      41: { name: "Stars", showOnSimple: true },
      51: { name: "Style", showOnSimple: false },
      52: { name: "Remotes", showOnSimple: false }
    }
  },
  49: { // Four Star Field Office
    name: "Four Star Field Office",
    options: {
      53: { name: "Style", showOnSimple: false },
      54: { name: "Remotes", showOnSimple: false }
    }
  },
  50: { name: "Duck Shuffler", options: {} },
  51: { name: "Prethinker", options: {} },
  52: { name: "Plutocrat", options: {} },
  53: { name: "Multislacker", options: {} },
  54: { name: "Rainmaker", options: {} },
  55: { name: "Pacesetter", options: {} },
  56: { name: "Major Player", options: {} },
  57: { name: "Bellringer", options: {} },
  58: { name: "Chainsaw Consultant", options: {} },
  59: { name: "Deep Diver", options: {} },
  60: { name: "Mouthpiece", options: {} },
  61: { name: "Featherbedder", options: {} },
  62: { name: "Gatekeeper", options: {} },
  63: { name: "Treekiller", options: {} },
  64: { name: "Firestarter", options: {} },
  65: { name: "Witch Hunter", options: {} },
  67: { name: "Building Marathon", options: {} },
  69: { name: "Fishing", options: {} }
};
