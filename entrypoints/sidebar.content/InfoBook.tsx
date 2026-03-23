import React, { useEffect, useState } from 'react';

type InfoBookTab = 'facilities' | 'field_office';

type FacilitySubtype = {
  name: string;
  rewardText: string;
  bossHealth: number;
};

type FacilityInfo = {
  title: string;
  rewardLabel: string;
  image: string;
  bossImage: string;
  cardBg: string;
  cardBorder: string;
  bossName: string;
  subtypes: FacilitySubtype[];
};

const FACILITIES_INFO: FacilityInfo[] = [
  {
    title: 'Sellbot Factory',
    rewardLabel: 'Merits',
    bossName: 'Factory Foreman',
    image: 'https://toonhq.org/static/assets/groups/large/factory.jpg',
    bossImage: '/images/foreman.webp',
    cardBg: '#7b00ae',
    cardBorder: '#9d4edd',
    subtypes: [
      {
        name: 'Scrap Factory',
        rewardText: '350-638',
        bossHealth: 250,
      },
      {
        name: 'Steel Factory',
        rewardText: '867-1630',
        bossHealth: 750,
      },
    ],
  },
  {
    title: 'Cashbot Mint',
    rewardLabel: 'Cogbucks',
    bossName: 'Mint Auditor',
    image: 'https://toonhq.org/static/assets/groups/large/mint.jpg',
    bossImage: '/images/auditor.webp',
    cardBg: '#108000',
    cardBorder: '#22c55e',
    subtypes: [
      {
        name: 'Coin Mint',
        rewardText: '702-807',
        bossHealth: 750,
      },
      {
        name: 'Bullion Mint',
        rewardText: '1626-1850',
        bossHealth: 1150,
      },
    ],
  },
  {
    title: 'Lawbot DA Office',
    rewardLabel: 'Jury Notices',
    bossName: 'Office Clerk',
    image: 'https://toonhq.org/static/assets/groups/large/da.jpg',
    bossImage: '/images/clerk.webp',
    cardBg: '#2e5db1',
    cardBorder: '#60a5fa',
    subtypes: [
      {
        name: 'Junior Wing',
        rewardText: '781-889',
        bossHealth: 1100,
      },
      {
        name: 'Senior Wing',
        rewardText: '1854-2082',
        bossHealth: 1500,
      },
    ],
  },
  {
    title: 'Bossbot Golf Course',
    rewardLabel: 'Stock Options',
    bossName: 'Club President',
    image: 'https://toonhq.org/static/assets/groups/large/golf.jpg',
    bossImage: '/images/president.webp',
    cardBg: '#8c5d3d',
    cardBorder: '#ca8a04',
    subtypes: [
      {
        name: 'The First Fairway',
        rewardText: '882-975',  
        bossHealth: 1200,
      },
      {
        name: 'The Final Fringe',
        rewardText: '2097-2305',
        bossHealth: 1750,
      },
    ],
  },
];

const FIELD_OFFICE_INFO = {
  boilerHpByStar: [
    { stars: '1-star', hp: '4000' },
    { stars: '2-star', hp: '4500' },
    { stars: '3-star', hp: '5000' },
    { stars: '4-star', hp: '5500' },
  ],
  keyAttacks: [
    { name: 'Under Pressure', summary: '25 / 30 / 35 / 40 base damage by stars.' },
    { name: 'Heated Discussion', summary: '20 / 24 / 28 / 32 base damage by stars.' },
    { name: 'Slow Burn', summary: 'DoT attack that scales with star level.' },
    { name: 'Stamp of Disapproval', summary: 'Heavy hit: 50 / 70 / 80 / 90 damage.' },
  ],
  keySpecialMoves: [
    { name: 'Promoted', summary: 'Cogs gain +1 / +2 / +2 / +3 levels.' },
    { name: 'Pay Raise', summary: 'Cogs gain +60 / +80 / +100 / +125 health.' },
    { name: 'Market Research', summary: 'Defense and accuracy buffs increase with stars.' },
    { name: 'Retention Plan', summary: 'Removes Lure from lured Cogs.' },
    { name: 'Quality Control', summary: 'Gag Ordinance lockout lasts 1 to 4 rounds.' },
  ],
} as const;

export function InfoBook() {
  const CLOSE_ANIMATION_MS = 260;
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [activeTab, setActiveTab] = useState<InfoBookTab>('facilities');
  const [activeFacility, setActiveFacility] = useState<number | null>(null);

  const getExtensionImageUrl = (path: string) => {
    const cleanPath = path.replace(/^\/+/, '');
    if (typeof browser !== 'undefined' && browser.runtime) {
      return (browser.runtime as any).getURL(cleanPath);
    }
    return `/${cleanPath}`;
  };

  const closeBook = () => {
    if (isClosing) return;
    setIsClosing(true);
    window.setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
    }, CLOSE_ANIMATION_MS);
  };

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeBook();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isClosing]);

  return (
    <>
      {!isOpen && (
        <div className="fixed bottom-4 left-4 z-[2147483646] pointer-events-auto">
          <button
            type="button"
            onClick={() => {
              setIsClosing(false);
              setIsOpen(true);
            }}
            className="group inline-flex h-11 w-11 items-center justify-center rounded-lg border border-emerald-500/30 bg-[#0c3622] text-white shadow-lg transition-all hover:bg-[#145837] hover:shadow-emerald-900/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/70 active:scale-95 cursor-pointer"
            aria-label="Open Shticker Book"
            title="Open Shticker Book"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-300 group-hover:text-emerald-200">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5V4.5A2.5 2.5 0 0 1 6.5 2Z" />
              <path d="M9 7h7" />
              <path d="M9 11h7" />
            </svg>
          </button>
        </div>
      )}

      {isOpen && (
        <div
          className={`info-book-overlay fixed inset-0 z-[2147483646] bg-black/50 ${isClosing ? 'is-closing' : ''}`}
          onClick={closeBook}
        >
          <div
            className={`info-book-panel absolute bottom-4 left-4 h-[95vh] w-[75vw] overflow-hidden rounded-2xl border border-[#0a2e1d] bg-[#0c3622] shadow-2xl ${isClosing ? 'is-closing' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#0a2e1d]/80 bg-[#10462d] px-4 py-3">
              <div className="flex items-center gap-2 text-white">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-300">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5V4.5A2.5 2.5 0 0 1 6.5 2Z" />
                  <path d="M9 7h7" />
                  <path d="M9 11h7" />
                </svg>
                <h3 className="text-base font-bold">Shticker Book</h3>
              </div>
            </div>

            <div className="flex h-[calc(95vh-3.5rem)]">
              <div className="w-48 shrink-0 border-r border-[#0a2e1d]/80 bg-[#0f3f28] p-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('facilities');
                    setActiveFacility(null);
                  }}
                  className={`mb-2 w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition-colors cursor-pointer ${activeTab === 'facilities' ? 'bg-[#145837] text-white shadow-inner' : 'text-green-100/80 hover:bg-black/20 hover:text-white'}`}
                >
                  Facilities
                </button>
                {activeTab === 'facilities' && (
                  <div className="mb-3 ml-2 space-y-1 border-l border-emerald-700/40 pl-2">
                    {FACILITIES_INFO.map((facility, idx) => (
                      <button
                        key={facility.title}
                        type="button"
                        onClick={() => setActiveFacility(idx)}
                        className={`w-full rounded-md px-2 py-1.5 text-left text-xs font-semibold transition-colors cursor-pointer ${
                          activeFacility === idx
                            ? 'bg-black/30 text-emerald-200'
                            : 'text-green-100/75 hover:bg-black/20 hover:text-white'
                        }`}
                      >
                        {facility.title}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setActiveTab('field_office')}
                  className={`w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition-colors cursor-pointer ${activeTab === 'field_office' ? 'bg-[#145837] text-white shadow-inner' : 'text-green-100/80 hover:bg-black/20 hover:text-white'}`}
                >
                  Field Office
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                {activeTab === 'facilities' && (
                  <>
                    {activeFacility === null ? (
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {FACILITIES_INFO.map((facility, idx) => (
                          <section
                            key={facility.title}
                            className="rounded-xl border p-3 text-white"
                            style={{
                              background: `linear-gradient(180deg, ${facility.cardBg}ee 0%, ${facility.cardBg}c8 55%, #0f172abf 100%)`,
                              borderColor: facility.cardBorder,
                            }}
                          >
                            <div className="mb-2 flex items-center justify-between gap-2">
                            <h4 className="text-sm font-bold text-right">{facility.title}</h4>
                              <button
                                type="button"
                                onClick={() => setActiveFacility(idx)}
                                className="rounded-full bg-black/30 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/90 transition-colors hover:bg-black/45"
                              >
                                Open Page
                              </button>
                            </div>
                            <div className="mb-2 grid grid-cols-[1fr_auto] gap-2">
                              <img
                                src={facility.image}
                                alt={facility.title}
                                className="h-40 w-full rounded-md border border-white/20 object-cover"
                              />
                              <img
                                src={getExtensionImageUrl(facility.bossImage)}
                                alt={facility.bossName}
                                className="h-40 w-40 rounded-md border border-white/20 bg-black/30 object-cover"
                              />
                            </div>
                            <div className="mt-2 space-y-1.5">
                              {facility.subtypes.map((subtype) => (
                                <div key={subtype.name} className="grid grid-cols-[1.1fr_1fr_1fr] items-center gap-2 rounded-md bg-black/25 px-2 py-1.5">
                                  <p className="text-sm font-semibold text-white">{subtype.name}</p>
                                  <p className="text-sm font-bold text-white/95">{subtype.rewardText} {facility.rewardLabel}</p>
                                  <p className="text-sm font-medium text-white/85 text-right pr-6">{subtype.bossHealth} HP</p>
                                </div>
                              ))}
                            </div>
                          </section>
                        ))}
                      </div>
                    ) : (
                      <section
                        className="rounded-xl border p-4 text-white"
                        style={{
                          background: `linear-gradient(180deg, ${FACILITIES_INFO[activeFacility].cardBg}ee 0%, ${FACILITIES_INFO[activeFacility].cardBg}c8 55%, #0f172abf 100%)`,
                          borderColor: FACILITIES_INFO[activeFacility].cardBorder,
                        }}
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                        <h4 className="text-lg font-bold">{FACILITIES_INFO[activeFacility].title}</h4>
                        </div>
                        <div className="mb-3 grid grid-cols-[1fr_auto] gap-2">
                          <img
                            src={FACILITIES_INFO[activeFacility].image}
                            alt={FACILITIES_INFO[activeFacility].title}
                            className="h-48 w-full rounded-md border border-white/20 object-cover"
                          />
                          <img
                            src={getExtensionImageUrl(FACILITIES_INFO[activeFacility].bossImage)}
                            alt={FACILITIES_INFO[activeFacility].bossName}
                            className="h-48 w-44 rounded-md border border-white/20 bg-black/30 object-cover"
                          />
                        </div>
                        <div className="mt-2 space-y-1.5">
                          {FACILITIES_INFO[activeFacility].subtypes.map((subtype) => (
                            <div key={subtype.name} className="grid grid-cols-[1.1fr_1fr_1fr] items-center gap-2 rounded-md bg-black/25 px-2 py-1.5">
                              <p className="text-sm font-semibold text-white">{subtype.name}</p>
                              <p className="text-sm font-bold text-white/95">{subtype.rewardText} {FACILITIES_INFO[activeFacility].rewardLabel}</p>
                              <p className="text-sm font-medium text-white/85 text-right pr-6">{subtype.bossHealth} HP</p>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}
                  </>
                )}

                {activeTab === 'field_office' && (
                  <div className="space-y-3">
                    <section className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <h4 className="mb-2 text-base font-bold text-white">Boiler HP by Stars</h4>
                      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                        {FIELD_OFFICE_INFO.boilerHpByStar.map((entry) => (
                          <div key={entry.stars} className="rounded-lg border border-emerald-500/20 bg-[#10462d]/60 p-2 text-center">
                            <div className="text-xs font-bold uppercase tracking-wider text-green-100/80">{entry.stars}</div>
                            <div className="text-xl font-black text-emerald-300 tabular-nums">{entry.hp}</div>
                          </div>
                        ))}
                      </div>
                    </section>
                    <section className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <h4 className="mb-2 text-base font-bold text-white">Moves at a Glance</h4>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        {FIELD_OFFICE_INFO.keyAttacks.map((attack) => (
                          <div key={attack.name} className="rounded-md bg-black/25 px-2.5 py-2">
                            <p className="text-sm font-semibold text-emerald-300">{attack.name}</p>
                            <p className="text-xs text-green-100/75">{attack.summary}</p>
                          </div>
                        ))}
                        {FIELD_OFFICE_INFO.keySpecialMoves.map((move) => (
                          <div key={move.name} className="rounded-md bg-black/25 px-2.5 py-2">
                            <p className="text-sm font-semibold text-emerald-300">{move.name}</p>
                            <p className="text-xs text-green-100/75">{move.summary}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={closeBook}
              className="absolute bottom-4 left-4 z-20 inline-flex h-11 w-11 items-center justify-center rounded-lg border border-emerald-500/35 bg-[#0c3622] text-white shadow-lg transition-all hover:bg-[#145837] focus:outline-none focus:ring-2 focus:ring-emerald-500/70 active:scale-95 cursor-pointer"
              aria-label="Close Shticker Book"
              title="Close Shticker Book"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-200">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5V4.5A2.5 2.5 0 0 1 6.5 2Z" />
                <path d="M9 7h7" />
                <path d="M9 11h7" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
