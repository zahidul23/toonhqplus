import React, { useEffect, useMemo, useState } from 'react';
import { gags as gagsConfig } from './gags';

type InfoBookTab = 'facilities' | 'field_office' | 'boiler_calc';

type AllowedGagTrackId = 'throw' | 'squirt' | 'sound';
type BoilerRoundType = 'neutral' | 'fired_up' | 'defense';
type GagVariant = 'base' | 'organic' | 'sos';
type SelectedGagCell = { trackId: AllowedGagTrackId; gagIndex: number; variant: GagVariant } | null;

const BOILER_CALC_ROUNDS = 17;
const BOILER_CALC_GAGS_PER_ROUND = 4;

const SOS_MOE = "https://rendition.toontownrewritten.com/render/7401000001000000008b010e000e0e010400000000000000000000000000000000/portrait/128x128.webp";
const SOS_SID = "https://rendition.toontownrewritten.com/render/7401010101000b000b8b0101000101010400000000000000000000000000000000/portrait/128x128.webp";
const SOS_BARB = "https://rendition.toontownrewritten.com/render/7407020201011a011a0a1d17001717010400000000000000000000000000000000/portrait/128x128.webp";

const allowedGagTrackIds: AllowedGagTrackId[] = ['throw', 'squirt', 'sound'];
const SOS_SOUND_GAGS: Array<{ gagIndex: number; damage: number; image: string }> = [
  { gagIndex: 3, damage: 35, image: SOS_MOE }, // Sound lvl 4
  { gagIndex: 4, damage: 55, image: SOS_SID }, // Sound lvl 5
  { gagIndex: 5, damage: 75, image: SOS_BARB }, // Sound lvl 6
];

function getBoilerRoundType(roundIndex: number): BoilerRoundType {
  if (roundIndex < 2) return 'neutral';
  const group = Math.floor((roundIndex - 2) / 3);
  return group % 2 === 0 ? 'fired_up' : 'defense';
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getHealthSegment(remaining: number, max: number): 'green' | 'yellow' | 'orange' | 'red' {
  if (max <= 0) return 'red';
  const greenThreshold = max * 0.85;
  const yellowThreshold = max * 0.65;
  const orangeThreshold = max * 0.3;

  if (remaining > greenThreshold) return 'green';
  if (remaining > yellowThreshold) return 'yellow';
  if (remaining > orangeThreshold) return 'orange';
  return 'red';
}

function MultiLayerBoilerHealthBar({ remaining, max }: { remaining: number; max: number }) {
  const safeMax = Math.max(0, max);
  const safeRemaining = clampNumber(remaining, 0, safeMax);

  const greenMax = safeMax * 0.15;
  const yellowMax = safeMax * 0.2;
  const orangeMax = safeMax * 0.35;
  const redMax = safeMax * 0.3;

  const greenLower = safeMax * 0.85;
  const yellowLower = safeMax * 0.65;
  const orangeLower = safeMax * 0.3;

  const segment = getHealthSegment(safeRemaining, safeMax);

  const greenWidth = segment === 'green' ? clampNumber((safeRemaining - greenLower) / (greenMax || 1), 0, 1) : 0;
  const yellowWidth = segment === 'green' ? 1 : segment === 'yellow' ? clampNumber((safeRemaining - yellowLower) / (yellowMax || 1), 0, 1) : 0;
  const orangeWidth =
    segment === 'green' || segment === 'yellow'
      ? 1
      : segment === 'orange'
        ? clampNumber((safeRemaining - orangeLower) / (orangeMax || 1), 0, 1)
        : 0;
  const redWidth =
    segment === 'green' || segment === 'yellow' || segment === 'orange'
      ? 1
      : clampNumber(safeRemaining / (redMax || 1), 0, 1);

  return (
    <div className="relative h-6 w-full overflow-hidden rounded-md bg-black/40 border border-white/10">
      <div className="absolute inset-y-0 left-0 bg-red-500 transition-all duration-200" style={{ width: `${redWidth * 100}%` }} />
      <div className="absolute inset-y-0 left-0 bg-orange-500 transition-all duration-200" style={{ width: `${orangeWidth * 100}%` }} />
      <div className="absolute inset-y-0 left-0 bg-yellow-400 transition-all duration-200" style={{ width: `${yellowWidth * 100}%` }} />
      <div className="absolute inset-y-0 left-0 bg-emerald-500 transition-all duration-200" style={{ width: `${greenWidth * 100}%` }} />
    </div>
  );
}

function DamageBadge({ value, className = '' }: { value: number; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border border-white/10 bg-black/40 px-1.5 py-0.5 text-[10px] font-black tabular-nums text-white/90 ${className}`}
    >
      {value}
    </span>
  );
}

function MinusDamageBubble({ value }: { value: number }) {
  return (
    <></>
    // <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-black px-1.5 text-[10px] font-black tabular-nums text-red-300 border border-black/80">
    //   -{value}
    // </span>
  );
}

function FireIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 22c4.4 0 8-3.4 8-7.8 0-3.1-1.9-5.8-4.8-7.2.3 2.2-.7 3.6-2.1 4.4.3-2.5-.9-5.3-3.6-7.4C9.4 5.1 7 7.8 7 11c0 1.7.7 3.2 1.8 4.3C7.6 15.7 6 14.9 5 13.7 4.4 14.9 4 16.2 4 17.5 4 20.1 7.6 22 12 22Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShieldIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 22s8-4 8-10V6l-8-4-8 4v6c0 6 8 10 8 10Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BoilerCalculator() {
  const [stars, setStars] = useState<1 | 2 | 3 | 4>(4);
  const [activeCell, setActiveCell] = useState<{ round: number; slot: number }>({ round: 0, slot: 0 });
  const [grid, setGrid] = useState<SelectedGagCell[][]>(() =>
    Array.from({ length: BOILER_CALC_ROUNDS }, () =>
      Array.from({ length: BOILER_CALC_GAGS_PER_ROUND }, () => null)
    )
  );
  const [lastAddedRound, setLastAddedRound] = useState<number | null>(null);
  const roundRowRefs = React.useRef<Array<HTMLDivElement | null>>([]);
  const roundsScrollRef = React.useRef<HTMLDivElement | null>(null);

  const gagTracks = useMemo(() => {
    return (gagsConfig as any[]).filter((t) => allowedGagTrackIds.includes(t.id)) as Array<{
      id: AllowedGagTrackId;
      name: string;
      color: string;
      gags: Array<{ name: string; image: string; base: number; organic?: number }>;
    }>;
  }, []);

  const getCellDamage = (cell: SelectedGagCell) => {
    if (!cell) return 0;
    const track = gagTracks.find((t) => t.id === cell.trackId);
    const gag = track?.gags?.[cell.gagIndex];
    if (!gag) return 0;

    if (cell.variant === 'sos') {
      if (cell.trackId !== 'sound') return gag.base ?? 0;
      const sos = SOS_SOUND_GAGS.find((s) => s.gagIndex === cell.gagIndex);
      return sos?.damage ?? gag.base ?? 0;
    }

    if (cell.variant === 'organic') {
      return gag.organic ?? gag.base ?? 0;
    }

    return gag.base ?? 0;
  };

  const isSosUsedInRound = (roundIndex: number, gagIndex: number) => {
    const round = grid[roundIndex];
    return round.some((cell) => cell?.variant === 'sos' && cell.trackId === 'sound' && cell.gagIndex === gagIndex);
  };

  const maxHp = useMemo(() => {
    const entry = FIELD_OFFICE_INFO.boilerHpByStar[stars - 1];
    return Number(String(entry.hp).replace(/,/g, '')) || 0;
  }, [stars]);

  const totalDamage = useMemo(() => {
    let sum = 0;
    for (let roundIndex = 0; roundIndex < grid.length; roundIndex++) {
      const round = grid[roundIndex];
      const roundType = getBoilerRoundType(roundIndex);

      const counts: Record<AllowedGagTrackId, number> = { throw: 0, squirt: 0, sound: 0 };
      for (const cell of round) {
        if (cell) counts[cell.trackId]++;
      }

      for (const cell of round) {
        if (!cell) continue;
        const baseDamage = getCellDamage(cell);
        if (!baseDamage) continue;

        const usedMoreThanOnce = counts[cell.trackId] > 1;
        const isFiredUp = roundType === 'fired_up';

        const multiplier = isFiredUp && usedMoreThanOnce ? 1.7 : isFiredUp ? 1.5 : usedMoreThanOnce ? 1.2 : 1;
        sum += Math.round(baseDamage * multiplier);
      }
    }
    return sum;
  }, [gagTracks, grid]);

  const roundStats = useMemo(() => {
    const stats = grid.map((round, roundIndex) => {
      const roundType = getBoilerRoundType(roundIndex);
      const counts: Record<AllowedGagTrackId, number> = { throw: 0, squirt: 0, sound: 0 };
      for (const cell of round) {
        if (cell) counts[cell.trackId]++;
      }

      let base = 0;
      let firedUpExtra = 0;
      let repeatExtra = 0;
      let total = 0;

      for (const cell of round) {
        if (!cell) continue;
        const cellBase = getCellDamage(cell);
        if (!cellBase) continue;

        const usedMoreThanOnce = counts[cell.trackId] > 1;
        const isFiredUp = roundType === 'fired_up';

        const noRepeatMultiplier = isFiredUp ? 1.5 : 1;
        const totalMultiplier = isFiredUp && usedMoreThanOnce ? 1.7 : isFiredUp ? 1.5 : usedMoreThanOnce ? 1.2 : 1;

        const noRepeatTotal = Math.round(cellBase * noRepeatMultiplier);
        const cellTotal = Math.round(cellBase * totalMultiplier);

        base += cellBase;
        firedUpExtra += Math.max(0, noRepeatTotal - cellBase);
        repeatExtra += Math.max(0, cellTotal - noRepeatTotal);
        total += cellTotal;
      }

      return { roundType, base, firedUpExtra, repeatExtra, total };
    });

    let rolling = 0;
    return stats.map((s) => {
      rolling += s.total;
      return { ...s, rolling };
    });
  }, [grid, gagTracks]);

  const remainingHp = clampNumber(maxHp - totalDamage, 0, maxHp);

  const selectGag = (trackId: AllowedGagTrackId, gagIndex: number, variant: GagVariant) => {
    if (variant === 'sos' && trackId === 'sound' && isSosUsedInRound(activeCell.round, gagIndex)) {
      return;
    }

    setLastAddedRound(activeCell.round);

    setGrid((prev) => {
      const next = prev.map((r) => r.slice());
      next[activeCell.round][activeCell.slot] = { trackId, gagIndex, variant };
      return next;
    });

    setActiveCell((prev) => {
      const nextSlot = prev.slot + 1;
      if (nextSlot < BOILER_CALC_GAGS_PER_ROUND) return { round: prev.round, slot: nextSlot };
      let nextRound = prev.round + 1;
      if (getBoilerRoundType(prev.round) !== 'defense') {
        while (nextRound < BOILER_CALC_ROUNDS && getBoilerRoundType(nextRound) === 'defense') nextRound++;
      }
      if (nextRound < BOILER_CALC_ROUNDS) return { round: nextRound, slot: 0 };
      return prev;
    });
  };

  const clearRound = (roundIndex: number) => {
    setGrid((prev) => {
      const next = prev.map((r) => r.slice());
      next[roundIndex] = Array.from({ length: BOILER_CALC_GAGS_PER_ROUND }, () => null);
      return next;
    });

    setActiveCell((prev) => (prev.round === roundIndex ? { round: roundIndex, slot: 0 } : prev));
    setLastAddedRound((prev) => (prev === roundIndex ? null : prev));
  };

  useEffect(() => {
    if (lastAddedRound == null) return;
    const el = roundRowRefs.current[lastAddedRound];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [lastAddedRound]);

  return (
    <div className="grid grid-cols-[40%_60%] gap-3 h-full">
      {/* Left: gag picker */}
      <section className="rounded-xl border border-white/10 bg-black/20 p-2 flex flex-col min-h-0">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="text-base font-bold text-white">Gag Pickers</h4>
          <div className="text-xs text-green-100/70 tabular-nums">
            Round {activeCell.round + 1} - Gag {activeCell.slot + 1}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-3">
          {gagTracks.map((track) => (
            <div key={track.id} className="rounded-lg border border-white/10 bg-black/20 p-2">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-black uppercase tracking-widest text-white/80">{track.name}</div>
                <div className="text-[10px] font-black uppercase tracking-wider text-green-100/60">Base / Organic</div>
              </div>

              {track.id === 'sound' && (
                <div className="mb-2 rounded-md border border-yellow-400/25 bg-yellow-500/10 p-2">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-yellow-200/90">
                      <span className="inline-flex h-4 items-center rounded-md bg-yellow-400/15 px-1.5 py-0.5 text-yellow-200 border border-yellow-400/25">
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-yellow-300">
                          <path d="M12 2l2.4 6.9H22l-5.9 4.3 2.3 6.8L12 15.9 5.6 20l2.3-6.8L2 8.9h7.6L12 2z" />
                        </svg>
                        <span className="ml-1">SOS</span>
                      </span>
                    </span>
                    <span className="text-[10px] text-green-100/60">One each per round</span>
                  </div>
                  <div className="flex justify-end gap-1.5">
                    {SOS_SOUND_GAGS.map((sos) => {
                      const gag = track.gags[sos.gagIndex];
                      const disabled = isSosUsedInRound(activeCell.round, sos.gagIndex) || getBoilerRoundType(activeCell.round) === 'defense';
                      return (
                        <button
                          key={`sos-${sos.gagIndex}`}
                          type="button"
                          onClick={() => selectGag('sound', sos.gagIndex, 'sos')}
                          disabled={disabled}
                          className={` gag-button group relative flex h-10 items-center justify-center rounded-md border transition-colors ${
                            disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:brightness-110'
                          }`}
                          style={{ backgroundColor: track.color, borderColor: track.color }}
                          title={`${gag?.name || 'Sound'} (SOS ${sos.damage})`}
                        >
                          
                            <img
                              src={sos.image}
                              alt={gag?.name || 'SOS'}
                              draggable="false"
                              className="h-8 w-8 rounded-sm object-contain drop-shadow-md transition-transform group-hover:scale-[1.03]"
                            />
                          <div className="absolute right-1 top-1">
                            <MinusDamageBubble value={sos.damage} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-7 gap-1.5">
                {track.gags.map((gag, idx) => (
                  <button
                    key={`${track.id}-${gag.name}`}
                    type="button"
                    onClick={() => selectGag(track.id, idx, 'base')}
                    className="gag-button group relative flex h-10 items-center justify-center rounded-md border transition-colors cursor-pointer hover:brightness-110"
                    style={{ backgroundColor: track.color, borderColor: track.color }}
                    title={`${gag.name} (${gag.base})`}
                  >
                    <img
                      src={`https://toonhq.org/static/assets/gags/${gag.image}`}
                      alt={gag.name}
                      draggable="false"
                      className="h-8 w-8 rounded-sm object-contain drop-shadow-md transition-transform group-hover:scale-[1.03]"
                    />
                    <div className="absolute right-1 top-1">
                      <MinusDamageBubble value={gag.base} />
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-2 grid grid-cols-7 gap-1.5">
                {track.gags.map((gag, idx) => {
                  const organicDamage = gag.organic ?? gag.base;
                  return (
                    <button
                      key={`${track.id}-${gag.name}-organic`}
                      type="button"
                      onClick={() => selectGag(track.id, idx, 'organic')}
                      className="gag-button group relative flex h-10 items-center justify-center rounded-md border transition-colors cursor-pointer hover:brightness-110"
                      style={{ backgroundColor: track.color, borderColor: track.color }}
                      title={`${gag.name} (Organic ${organicDamage})`}
                    >
                      <img
                        src={`https://toonhq.org/static/assets/gags/${gag.image}`}
                        alt={`${gag.name} organic`}
                        draggable="false"
                        className="h-8 w-8 rounded-sm object-contain drop-shadow-md transition-transform group-hover:scale-[1.03]"
                      />
                      <div className="absolute right-1 top-1">
                        <MinusDamageBubble value={organicDamage} />
                      </div>
                      <div className="absolute -bottom-1 -right-1 drop-shadow-[0_1px_1px_rgba(0,0,0,1)]">
                        <img
                          src="https://toonhq.org/static/assets/gags/ttr/organic.webp"
                          alt="Organic"
                          draggable="false"
                          className="h-5 w-5 object-contain"
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Right: rounds + HP */}
      <section className="rounded-xl border border-white/10 bg-black/20 p-2 flex flex-col h-full">
        <div className="mb-2 flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setStars(n as 1 | 2 | 3 | 4)}
                className={`rounded-md px-2 py-1 text-xs font-bold transition-colors cursor-pointer ${
                  stars === n ? 'bg-emerald-600 text-white shadow-inner' : 'bg-black/25 text-green-100/80 hover:bg-black/40'
                }`}
                title={`${n}-star`}
              >
                {n}
              </button>
            ))}
          </div>

          <div className="relative flex-1">
            <MultiLayerBoilerHealthBar remaining={remainingHp} max={maxHp} />
            <div className="absolute inset-0 flex items-center justify-center text-xs font-black tabular-nums text-white drop-shadow-[0_1px_1px_rgba(0,0,0,1)]">
              {remainingHp} / {maxHp}
            </div>
          </div>
        </div>

        <div ref={roundsScrollRef} className="flex-1 overflow-y-auto custom-scrollbar pr-1">
          <div className="grid grid-cols-2 gap-1.5">
            {grid.map((round, roundIndex) => {
              const roundType = getBoilerRoundType(roundIndex);
              const isActiveRound = activeCell.round === roundIndex;
              const hasAny = round.some(Boolean);
              const isDefense = roundType === 'defense';
              const isExpanded = !isDefense || hasAny || isActiveRound;
              const stats = roundStats[roundIndex];

              const roundTypeStyles =
                roundType === 'fired_up'
                  ? 'bg-red-500/20 border-red-500/30'
                  : roundType === 'defense'
                    ? 'bg-sky-500/10 border-sky-500/20'
                    : 'bg-black/15 border-white/10';

              return (
                <div
                  key={roundIndex}
                  className={`rounded-lg border ${roundTypeStyles} ${isActiveRound ? 'ring-2 ring-emerald-500/60' : ''}`}
                  ref={(el) => {
                    roundRowRefs.current[roundIndex] = el;
                  }}
                >
                  <div className={`flex items-center gap-2 ${isExpanded ? 'p-2' : 'px-2 py-1'}`}>
                    <div className="w-7 shrink-0 flex flex-col items-center justify-center gap-1">
                      <div className="text-xs font-black text-white tabular-nums">{roundIndex + 1}</div>
                      {roundType === 'fired_up' ? (
                        <div className="text-red-200/90">
                          <FireIcon className="h-4 w-4" />
                        </div>
                      ) : roundType === 'defense' ? (
                        <div className="text-sky-200/90">
                          <ShieldIcon className="h-4 w-4" />
                        </div>
                      ) : (
                        <div className="h-4 w-4" />
                      )}
                    </div>

                    {isExpanded ? (
                    <div className="flex">
                      {round.map((cell, slotIndex) => {
                      const isActive = activeCell.round === roundIndex && activeCell.slot === slotIndex;
                      const track = cell ? gagTracks.find((t) => t.id === cell.trackId) : null;
                      const gag = cell && track ? track.gags[cell.gagIndex] : null;
                      const cellDamage = cell ? getCellDamage(cell) : 0;
                      const showFiredUp = roundType === 'fired_up' && !!cell;

                      return (
                        <button
                          key={slotIndex}
                          type="button"
                          onClick={() => {
                            setActiveCell({ round: roundIndex, slot: slotIndex });
                          }}
                          className={`gag-button group relative flex h-10 items-center justify-center rounded-md border transition-colors cursor-pointer ${
                            isActive ? 'border-emerald-400/70 bg-emerald-500/10' : 'border-white/10 bg-black/25 hover:bg-black/35'
                          }`}
                          style={
                            cell && track
                              ? { backgroundColor: track.color, borderColor: track.color }
                              : undefined
                          }
                          title={gag ? `${gag.name} (${cellDamage})` : 'Empty'}
                        >
                          {gag ? (
                            <img
                              src={`https://toonhq.org/static/assets/gags/${gag.image}`}
                              alt={gag.name}
                              draggable="false"
                              className="h-8 w-8 rounded-sm object-contain drop-shadow-md"
                            />
                          ) : (
                            <span className="text-xs text-green-100/30">—</span>
                          )}
                          {showFiredUp && (
                            <div className="absolute left-1 top-1 text-[10px] font-black text-white/95 drop-shadow-[0_1px_1px_rgba(0,0,0,1)]">
                              1.5x
                            </div>
                          )}
                          {!!cellDamage && (
                            <div className="absolute right-1 top-1">
                              <MinusDamageBubble value={cellDamage} />
                            </div>
                          )}
                          {cell?.variant === 'organic' && (
                            <div className="absolute -bottom-1 -right-1 drop-shadow-[0_1px_1px_rgba(0,0,0,1)]">
                              <img
                                src="https://toonhq.org/static/assets/gags/ttr/organic.webp"
                                alt="Organic"
                                draggable="false"
                                className="h-5 w-5 object-contain"
                              />
                            </div>
                          )}
                          {cell?.variant === 'sos' && (
                            <div className="absolute -bottom-1 -right-1 drop-shadow-[0_1px_1px_rgba(0,0,0,1)] text-yellow-300">
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2l2.4 6.9H22l-5.9 4.3 2.3 6.8L12 15.9 5.6 20l2.3-6.8L2 8.9h7.6L12 2z" />
                              </svg>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                    ) : (
                      <div className="flex-1" />
                    )}

                    <div className="w-24 shrink-0 text-right flex flex-col items-end gap-1">
                      {hasAny && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            clearRound(roundIndex);
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/35 px-2 py-1 text-[10px] font-black text-white/80 hover:bg-black/50 hover:text-white transition-colors cursor-pointer"
                          title="Clear row"
                        >
                          <span>Clear</span>
                          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 6 6 18" />
                            <path d="m6 6 12 12" />
                          </svg>
                        </button>
                      )}
                      <div className="text-sm font-black tabular-nums text-red-300">-{stats?.total ?? 0}</div>
                      <div className="text-[10px] font-black tabular-nums text-red-200/60">-{stats?.rolling ?? 0}</div>
                      {!!stats?.repeatExtra && (
                        <div className="text-[10px] font-black tabular-nums text-red-200/60">
                          -{stats.repeatExtra} <span className="text-red-200/40">(+20%)</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

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

export function ShtickerBook() {
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
            className={`info-book-panel absolute bottom-4 left-4 h-[95vh] w-[90em] overflow-hidden rounded-2xl border border-[#0a2e1d] bg-[#0c3622] shadow-2xl ${isClosing ? 'is-closing' : ''}`}
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
                  onClick={() => {
                    setActiveTab('field_office');
                    setActiveFacility(null);
                  }}
                  className={`w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition-colors cursor-pointer ${activeTab === 'field_office' ? 'bg-[#145837] text-white shadow-inner' : 'text-green-100/80 hover:bg-black/20 hover:text-white'}`}
                >
                  Field Office
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('boiler_calc');
                    setActiveFacility(null);
                  }}
                  className={`mt-2 w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition-colors cursor-pointer ${activeTab === 'boiler_calc' ? 'bg-[#145837] text-white shadow-inner' : 'text-green-100/80 hover:bg-black/20 hover:text-white'}`}
                >
                  Boiler Calculator
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

                {activeTab === 'boiler_calc' && <BoilerCalculator />}
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
