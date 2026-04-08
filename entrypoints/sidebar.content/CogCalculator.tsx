import React, { useState, useMemo, memo } from 'react';
import { gags as gagsConfig } from './gags';

// ─── Constants & Types ────────────────────────────────────────────────────────

const COG_HEALTH: Record<number, number> = {
  1: 6, 2: 12, 3: 20, 4: 30, 5: 42, 6: 56, 7: 72, 8: 90, 9: 110, 10: 132,
  11: 156, 12: 196, 13: 224, 14: 254, 15: 286, 16: 320, 17: 356, 18: 394, 19: 434, 20: 476
};

const SOS_MOE = 'https://rendition.toontownrewritten.com/render/7401000001000000008b010e000e0e010400000000000000000000000000000000/portrait/128x128.webp';
const SOS_SID = 'https://rendition.toontownrewritten.com/render/7401010101000b000b8b0101000101010400000000000000000000000000000000/portrait/128x128.webp';
const SOS_BARB = 'https://rendition.toontownrewritten.com/render/7407020201011a011a0a1d17001717010400000000000000000000000000000000/portrait/128x128.webp';

const SOS_CLERK_WILL = 'https://rendition.toontownrewritten.com/render/740f010201000b000b05000a000a0a010400000000000000000000000000000000/portrait/128x128.webp';
const SOS_CLERK_PENNY = 'https://rendition.toontownrewritten.com/render/74120201000019001908050c000c0c010400000000000000000000000000000000/portrait/128x128.webp';
const SOS_CLERK_CLARA = 'https://rendition.toontownrewritten.com/render/741101020001090109171502000202010400000000000000000000000000000000/portrait/128x128.webp';

const SOS_STINKY_NED = 'https://rendition.toontownrewritten.com/render/7415000001000000008b0206000606010400000000000000000000000000000000/portrait/128x128.webp';
const SOS_NANCY_GAS = 'https://rendition.toontownrewritten.com/render/7412000001010101010e1b08000808010400000000000000000000000000000000/portrait/128x128.webp';
const SOS_LIL_OLDMAN = 'https://rendition.toontownrewritten.com/render/7411020101010501058b0915001515010400000000000000000000000000000000/portrait/128x128.webp';

const SOS_CLUMSY_NED = 'https://rendition.toontownrewritten.com/render/740c020201010701078b0a0c000c0c010400000000000000000000000000000000/portrait/128x128.webp';
const SOS_FRANZ_NECKVEIN = 'https://rendition.toontownrewritten.com/render/740d000101000200028b0607000707010400000000000000000000000000000000/portrait/128x128.webp';
const SOS_BARNACLE_BESSIE = 'https://rendition.toontownrewritten.com/render/7414050200010c010c01190d000d0d010400000000000000000000000000000000/portrait/128x128.webp';


const SOS_GAGS: Record<string, Array<{ gagIndex: number; damage: number; turns?: number; image: string; name: string }>> = {
  trap: [
    { gagIndex: 3, damage: 60, image: SOS_CLERK_WILL, name: "Clerk Will" },
    { gagIndex: 4, damage: 120, image: SOS_CLERK_PENNY, name: "Clerk Penny" },
    { gagIndex: 5, damage: 180, image: SOS_CLERK_CLARA, name: "Clerk Clara" },
  ],
  sound: [
    { gagIndex: 3, damage: 35, image: SOS_BARB, name: "Barbara Seville" },
    { gagIndex: 4, damage: 55, image: SOS_SID, name: "Sid Sonata" },
    { gagIndex: 5, damage: 75, image: SOS_MOE, name: "Moe Zart" },
  ],
  drop: [
    { gagIndex: 3, damage: 60, image: SOS_CLUMSY_NED, name: "Clumsy Ned" },
    { gagIndex: 4, damage: 100, image: SOS_FRANZ_NECKVEIN, name: "Franz Neckvein" },
    { gagIndex: 5, damage: 170, image: SOS_BARNACLE_BESSIE, name: "Barnacle Bessie" },
  ],
};

const LURE_DURATIONS: Record<number, number> = {
  0: 3, 1: 3, 2: 4, 3: 4, 4: 5, 5: 5, 6: 9
};

type GagVariant = 'base' | 'organic' | 'sos';
type SelectedGag = { trackId: string; gagIndex: number; variant: GagVariant; target: 'single' | 'all'; targetIdx?: number } | null;

type GagTrack = {
  id: string;
  name: string;
  color: string;
  gags: Array<{ name: string; image: string; base: number; organic?: number }>;
};

interface Cog {
  level: number;
  isTrapped: boolean;
  isLured: boolean;
  lureDuration?: number;
}

// ─── Components ───────────────────────────────────────────────────────────────

const GagButton = memo(({ imageSrc, imageAlt, color, title, damage, disabled = false, onClick, overlayBottomRight, overlayBottom, targetPopup }: any) => {
  return (
    <div className="relative group">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`gag-button relative flex h-10 w-10 items-center justify-center rounded-md border transition-colors ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:brightness-110'
          }`}
        style={{ backgroundColor: color, borderColor: color }}
        title={title}
      >
        <div className="h-8 w-8 flex items-center justify-center">
          <img
            src={imageSrc}
            alt={imageAlt}
            draggable="false"
            className="h-8 w-8 rounded-sm drop-shadow-md"
          />
        </div>
        {overlayBottom && (
          <div className="absolute inset-x-0 bottom-0.5 flex justify-center gap-0.5 px-1">
            {overlayBottom}
          </div>
        )}
        {overlayBottomRight && (
          <div className="absolute -bottom-1 -right-1 z-10 transition-transform group-hover:scale-110">
            {overlayBottomRight}
          </div>
        )}
      </button>
      {targetPopup}
    </div>
  );
});

function GagTrackPicker({ track, onSelectGag, cogs, cogDamages, getHealthColor, activePopup, setActivePopup }: { track: GagTrack, onSelectGag: any, cogs: Cog[], cogDamages: number[], getHealthColor: any, activePopup: any, setActivePopup: any }) {
  const sosGags = SOS_GAGS[track.id] || [];

  const TargetPopup = ({ trackId, gagIndex, variant }: { trackId: string; gagIndex: number; variant: GagVariant }) => {
    const isOpen = activePopup?.trackId === trackId && activePopup?.gagIndex === gagIndex && activePopup?.variant === variant;
    if (!isOpen) return null;

    return (
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max bg-[#0c3622] p-1.5 rounded-xl border border-white/10 shadow-2xl z-50 animate-in fade-in slide-in-from-bottom-1">
        <div className="flex gap-1">
          {[0, 1, 2, 3].map(cogIdx => {
            const cog = cogs[cogIdx];
            const maxHp = COG_HEALTH[cog.level];
            const remainingHp = Math.max(0, maxHp - (cogDamages[cogIdx] || 0));
            const percentage = (remainingHp / maxHp) * 100;

            return (
              <button
                key={cogIdx}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectGag(trackId, gagIndex, variant, cogIdx);
                  setActivePopup(null);
                }}
                className="flex flex-col items-center justify-between p-1.5 w-10 h-10 rounded-lg border border-white/5 bg-black/40 hover:bg-emerald-500/20 hover:border-emerald-500 transition-all cursor-pointer"
              >
                <div className="flex-1 flex items-center justify-center">
                  <span className="text-[11px] font-black text-white/80">{cog.level}</span>
                </div>
                <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden relative">
                  <div
                    className={`h-full transition-all duration-300 ${getHealthColor(percentage)}`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>
        <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-[#0c3622]"></div>
      </div>
    );
  };

  const handleGagClick = (e: React.MouseEvent, trackId: string, gagIndex: number, variant: GagVariant, isAllTarget: boolean) => {
    e.stopPropagation();
    if (isAllTarget) {
      onSelectGag(trackId, gagIndex, variant);
      setActivePopup(null);
    } else {
      if (activePopup?.trackId === trackId && activePopup?.gagIndex === gagIndex && activePopup?.variant === variant) {
        setActivePopup(null);
      } else {
        setActivePopup({ trackId, gagIndex, variant });
      }
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      {sosGags.length > 0 && (
        <div className="flex gap-1">
          <div className="w-14 h-10" />
          <div className="w-14 h-10" />
          <div className="w-14 h-10" />
          <div className="w-14 h-10" />
          {sosGags.map((sos: any) => (
            <GagButton
              key={`sos-${sos.gagIndex}`}
              imageSrc={sos.image}
              imageAlt={sos.name}
              color={track.color}
              title={`${sos.name} (${sos.damage})`}
              damage={sos.damage}
              onClick={(e: any) => handleGagClick(e, track.id, sos.gagIndex, 'sos', true)}
            />
          ))}
        </div>
      )}

      <div className="flex gap-1 items-center">
        {track.gags.map((gag: any, idx: number) => {
          const isAllTarget = track.id === 'sound' || idx === 6 || (track.id === 'lure' && [1, 3, 5].includes(idx));
          const titleText = track.id === 'lure'
            ? `${gag.name} (${LURE_DURATIONS[idx]} rounds)`
            : `${gag.name} (${gag.base})`;

          return (
            <GagButton
              key={`${track.id}-${idx}-base`}
              imageSrc={`https://toonhq.org/static/assets/gags/${gag.image}`}
              imageAlt={gag.name}
              color={track.color}
              title={titleText}
              damage={gag.base}
              onClick={(e: any) => handleGagClick(e, track.id, idx, 'base', isAllTarget)}
              targetPopup={!isAllTarget && (
                <TargetPopup trackId={track.id} gagIndex={idx} variant="base" />
              )}
            />
          );
        })}
      </div>

      {track.id !== 'lure' && (
        <div className="flex gap-1">
          {track.gags.map((gag: any, idx: number) => {
            const organicDamage = gag.organic ?? gag.base;
            const isAllTarget = track.id === 'sound' || idx === 6;
            return (
              <GagButton
                key={`${track.id}-${idx}-organic`}
                imageSrc={`https://toonhq.org/static/assets/gags/${gag.image}`}
                imageAlt={`${gag.name} organic`}
                color={track.color}
                title={`${gag.name} (Organic ${organicDamage})`}
                damage={organicDamage}
                onClick={(e: any) => handleGagClick(e, track.id, idx, 'organic', isAllTarget)}
                targetPopup={!isAllTarget && (
                  <TargetPopup trackId={track.id} gagIndex={idx} variant="organic" />
                )}
                overlayBottomRight={
                  <img
                    src="https://toonhq.org/static/assets/gags/ttr/organic.webp"
                    alt="Organic"
                    className="h-5 w-5"
                  />
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export function CogCalculator() {
  const [cogs, setCogs] = useState<Cog[]>([
    { level: 12, isTrapped: false, isLured: false },
    { level: 12, isTrapped: false, isLured: false },
    { level: 12, isTrapped: false, isLured: false },
    { level: 12, isTrapped: false, isLured: false },
  ]);
  const [selectedGagsByRound, setSelectedGagsByRound] = useState<SelectedGag[][]>([
    [null, null, null, null],
    [null, null, null, null],
    [null, null, null, null],
    [null, null, null, null],
  ]);
  const [activeRound, setActiveRound] = useState<number>(0);
  const [activeGagSlot, setActiveGagSlot] = useState<number>(0);
  const [activePopup, setActivePopup] = useState<{ trackId: string; gagIndex: number; variant: GagVariant } | null>(null);

  const gagTracks = useMemo(() => {
    return (gagsConfig as GagTrack[]).filter(t => t.id !== 'toonup');
  }, []);

  const handleSelectGag = (trackId: string, gagIndex: number, variant: GagVariant, targetIdx?: number) => {
    const isAllTarget = trackId === 'sound' || variant === 'sos' || gagIndex === 6 || (trackId === 'lure' && [1, 3, 5, 6].includes(gagIndex));

    setSelectedGagsByRound(prev => {
      const next = [...prev.map(r => [...r])];
      next[activeRound][activeGagSlot] = {
        trackId,
        gagIndex,
        variant,
        target: isAllTarget ? 'all' : 'single',
        targetIdx: isAllTarget ? undefined : (targetIdx ?? 0)
      };
      return next;
    });
    setActiveGagSlot(prev => (prev + 1) % 4);
  };

  const clearGagSlot = (rIdx: number, slotIdx: number) => {
    setSelectedGagsByRound(prev => {
      const next = [...prev.map(r => [...r])];
      next[rIdx][slotIdx] = null;
      return next;
    });
    setActiveRound(rIdx);
    setActiveGagSlot(slotIdx);
  };

  const getGagDamage = (gag: SelectedGag): number => {
    if (!gag) return 0;
    const track = gagTracks.find(t => t.id === gag.trackId);
    if (!track) return 0;

    if (gag.variant === 'sos') {
      const sos = (SOS_GAGS[gag.trackId] || []).find(s => s.gagIndex === gag.gagIndex);
      return sos?.damage ?? 0;
    }

    const gagData = track.gags[gag.gagIndex];
    if (!gagData) return 0;

    return gag.variant === 'organic' ? (gagData.organic ?? gagData.base) : gagData.base;
  };

  const roundResults = useMemo(() => {
    let currentCogs = cogs.map(c => ({ ...c, lureDuration: 0, trapDamage: 0 }));
    let cumulativeDamages = [0, 0, 0, 0];
    const results = [];

    for (let r = 0; r < 4; r++) {
      const selectedGags = selectedGagsByRound[r];
      const cogDamagesThisRound = [0, 0, 0, 0];
      const trackDamages: Record<string, number> = {};
      const trapDamageOnCog = currentCogs.map(c => c.trapDamage || 0);

      const trackOrder = ['trap', 'lure', 'sound', 'throw', 'squirt', 'drop'];

      trackOrder.forEach(trackId => {
        const gagsInTrack = selectedGags.filter(g => g?.trackId === trackId);
        if (gagsInTrack.length === 0) return;

        const hitCounts = [0, 0, 0, 0];
        gagsInTrack.forEach(gag => {
          if (!gag) return;
          const targets = gag.target === 'all' ? [0, 1, 2, 3] : [gag.targetIdx!];
          targets.forEach(t => hitCounts[t]++);
        });

        const luredAtStartOfPhase = currentCogs.map(c => c.isLured);
        const trappedAtStartOfPhase = currentCogs.map(c => c.isTrapped);

        gagsInTrack.forEach(gag => {
          if (!gag) return;
          let baseDmg = getGagDamage(gag);
          const targets = gag.target === 'all' ? [0, 1, 2, 3] : [gag.targetIdx!];

          targets.forEach(cogIdx => {
            const cog = currentCogs[cogIdx];
            let currentDmg = baseDmg;

            if (hitCounts[cogIdx] >= 2 && !['trap', 'lure'].includes(trackId)) {
              currentDmg = Math.floor(currentDmg * 1.2);
            }

            if (trackId === 'trap') {
              if (!luredAtStartOfPhase[cogIdx]) {
                cog.isTrapped = true;
                trapDamageOnCog[cogIdx] = currentDmg;
              }
            } else if (trackId === 'lure') {
              if (trappedAtStartOfPhase[cogIdx]) {
                const trapDmg = trapDamageOnCog[cogIdx];
                cogDamagesThisRound[cogIdx] += trapDmg;
                trackDamages['trap'] = (trackDamages['trap'] || 0) + trapDmg;
                trapDamageOnCog[cogIdx] = 0;
                cog.isTrapped = false;
                cog.isLured = false;
                cog.lureDuration = 0;
              } else {
                cog.isLured = true;
                cog.lureDuration = LURE_DURATIONS[gag.gagIndex] || 3;
              }
            } else if (trackId === 'sound') {
              cogDamagesThisRound[cogIdx] += currentDmg;
              trackDamages[trackId] = (trackDamages[trackId] || 0) + currentDmg;
              cog.isLured = false;
              cog.lureDuration = 0;
            } else if (trackId === 'throw' || trackId === 'squirt') {
              if (luredAtStartOfPhase[cogIdx]) {
                currentDmg = Math.floor(currentDmg * 1.5);
              }
              cogDamagesThisRound[cogIdx] += currentDmg;
              trackDamages[trackId] = (trackDamages[trackId] || 0) + currentDmg;
              cog.isLured = false;
              cog.lureDuration = 0;
            } else if (trackId === 'drop') {
              if (!luredAtStartOfPhase[cogIdx]) {
                cogDamagesThisRound[cogIdx] += currentDmg;
                trackDamages[trackId] = (trackDamages[trackId] || 0) + currentDmg;
              }
            }
          });
        });
      });

      currentCogs.forEach((cog, i) => {
        cog.trapDamage = trapDamageOnCog[i];
        if (cog.isLured && cog.lureDuration !== undefined) {
          cog.lureDuration--;
          if (cog.lureDuration <= 0) {
            cog.isLured = false;
            cog.lureDuration = 0;
          }
        }
        cumulativeDamages[i] += cogDamagesThisRound[i];
      });

      results.push({
        finalCogs: JSON.parse(JSON.stringify(currentCogs)),
        cogDamages: [...cumulativeDamages],
        trackDamages
      });
    }

    return results;
  }, [selectedGagsByRound, gagTracks, cogs]);

  const activeStats = roundResults[activeRound];

  const getHealthColor = (percentage: number) => {
    if (percentage > 85) return 'bg-emerald-500';
    if (percentage > 65) return 'bg-yellow-500';
    if (percentage > 30) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const toggleTrapped = (idx: number) => {
    setCogs(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], isTrapped: !next[idx].isTrapped };
      return next;
    });
  };

  const toggleLured = (idx: number) => {
    setCogs(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], isLured: !next[idx].isLured };
      return next;
    });
  };

  return (
    <div className="grid grid-cols-[2fr_3fr] gap-3 h-full" onClick={() => setActivePopup(null)}>
      {/* Left Panel: Gag Picker */}
      <div className="flex flex-col gap-2 bg-black/40 rounded-xl p-3 h-fit">
        <div className="text-base font-bold text-white px-2 mb-1">Gag Picker (Round {activeRound + 1})</div>
        <div className="bg-black/20 rounded-lg p-2 border border-white/5 flex flex-col gap-4">
          {gagTracks.map(track => (
            <GagTrackPicker
              key={track.id}
              track={track}
              onSelectGag={handleSelectGag}
              cogs={cogs}
              cogDamages={activeStats.cogDamages}
              getHealthColor={getHealthColor}
              activePopup={activePopup}
              setActivePopup={setActivePopup}
            />
          ))}
        </div>
      </div>

      {/* Right Panel: Cogs & Selection */}
      <div className="flex flex-col gap-3">
        {/* Cogs Panel */}
        <div className="bg-black/40 rounded-xl p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h4 className="text-base font-bold text-white">Cogs After Round {activeRound + 1}</h4>
            <div className="text-xs text-white/40 uppercase font-black tracking-widest">Target Selection</div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {cogs.map((cog, idx) => {
              const maxHp = COG_HEALTH[cog.level];
              const remainingHp = Math.max(0, maxHp - activeStats.cogDamages[idx]);
              const percentage = (remainingHp / maxHp) * 100;
              const finalCog = activeStats.finalCogs[idx];

              return (
                <div key={idx} className="flex flex-col gap-2">
                  <div className="relative group">
                    <select
                      value={cog.level}
                      onChange={(e) => {
                        const next = [...cogs];
                        next[idx] = { ...next[idx], level: parseInt(e.target.value) };
                        setCogs(next);
                      }}
                      className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white font-bold text-sm appearance-none cursor-pointer hover:bg-black/60 transition-colors"
                    >
                      {Object.keys(COG_HEALTH).map(lvl => (
                        <option key={lvl} value={lvl}>Level {lvl}</option>
                      ))}
                    </select>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-white/20">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                    </div>
                  </div>
                  <div className="bg-black/20 border border-white/5 rounded-lg p-2 flex flex-col gap-2">
                    <div className="h-8 w-full bg-white/5 rounded-md overflow-hidden relative">
                      <div
                        className={`h-full transition-all duration-500 ${getHealthColor(percentage)}`}
                        style={{ width: `${percentage}%` }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[10px] font-black text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] tabular-nums">
                          {remainingHp} / {maxHp}
                        </span>
                      </div>
                    </div>
                    {/* Status Indicators Area */}
                    <div className="flex gap-3 h-8 items-center justify-center">
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleTrapped(idx); }}
                        className={`transition-all cursor-pointer ${finalCog.isTrapped ? 'opacity-100' : 'opacity-20 hover:opacity-40'}`}
                        title="Trapped"
                      >
                        <img
                          src="https://toonhq.org/static/assets/gags/ttr/banana_peel.png"
                          alt="Trapped"
                          className="w-6 h-6 object-contain"
                        />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleLured(idx); }}
                        className={`transition-all cursor-pointer relative ${finalCog.isLured ? 'opacity-100' : 'opacity-20 hover:opacity-40'}`}
                        title="Lured"
                      >
                        <img
                          src="https://toonhq.org/static/assets/gags/ttr/small_magnet.png"
                          alt="Lured"
                          className="w-6 h-6 object-contain"
                        />
                        {finalCog.isLured && finalCog.lureDuration !== undefined && (
                          <span className="absolute -top-1 -right-1 bg-green-500 text-[8px] font-black text-white px-1 rounded-full border border-black/20">
                            {finalCog.lureDuration}
                          </span>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Gags Panel */}
        <div className="flex-1 bg-[#082416] rounded-xl p-4 flex flex-col gap-2 border border-white/5 shadow-inner min-h-[300px]">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-base font-bold text-white">Rounds</h4>
            <button
              onClick={() => {
                setSelectedGagsByRound([
                  [null, null, null, null],
                  [null, null, null, null],
                  [null, null, null, null],
                  [null, null, null, null],
                ]);
                setActiveRound(0);
                setActiveGagSlot(0);
              }}
              className="text-[10px] font-black uppercase text-red-400 hover:text-red-300 transition-colors"
            >
              Clear All
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3].map(rIdx => (
              <div
                key={rIdx}
                onClick={() => {
                  setActiveRound(rIdx);
                  setActiveGagSlot(0);
                }}
                className={`flex items-center gap-3 p-2 rounded-xl border transition-all cursor-pointer ${activeRound === rIdx
                  ? 'bg-emerald-500/10 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                  : 'bg-black/20 border-white/5 hover:bg-black/40 hover:border-white/10'
                  }`}
              >
                <div className="w-16 flex flex-col items-center">
                  <span className="text-[10px] font-black text-white/40 uppercase">Round {rIdx + 1}</span>
                </div>
                <div className="flex-1 flex gap-2">
                  {selectedGagsByRound[rIdx].map((gag, gIdx) => {
                    const track = gag ? gagTracks.find(t => t.id === gag.trackId) : null;
                    const gagData = track ? track.gags[gag!.gagIndex] : null;
                    const sosInfo = gag?.variant === 'sos' ? (SOS_GAGS[gag!.trackId] || []).find(s => s.gagIndex === gag!.gagIndex) : null;
                    const imgSrc = sosInfo ? sosInfo.image : (gagData ? `https://toonhq.org/static/assets/gags/${gagData.image}` : null);
                    const isSlotActive = activeRound === rIdx && activeGagSlot === gIdx;

                    return (
                      <div key={gIdx} className="flex flex-col items-center gap-1">
                        <div className="flex gap-0.5 h-3 items-center">
                          {[0, 1, 2, 3].map(cIdx => {
                            const isTargeted = gag ? (gag.target === 'all' || gag.targetIdx === cIdx) : false;
                            return (
                              <span key={cIdx} className={`text-[9px] font-black w-1.5 text-center ${isTargeted ? 'text-emerald-400' : 'text-white/10'}`}>
                                {isTargeted ? 'X' : '-'}
                              </span>
                            );
                          })}
                        </div>
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            if (gag) clearGagSlot(rIdx, gIdx);
                            else {
                              setActiveRound(rIdx);
                              setActiveGagSlot(gIdx);
                            }
                          }}
                          className={`w-10 h-10 rounded-lg border flex items-center justify-center relative transition-all cursor-pointer ${isSlotActive ? 'border-emerald-500 bg-emerald-500/20' :
                            gag ? 'border-white/20' : 'border-dashed border-white/5 bg-black/20'
                            }`}
                          style={gag && track ? { backgroundColor: track.color } : {}}
                        >
                          {imgSrc ? (
                            <img src={imgSrc} alt="Gag" className="w-8 h-8 object-contain" />
                          ) : (
                            <span className="text-[10px] font-black text-white/10">{gIdx + 1}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
