/**
 * Simulation clock controls (SPEC §6.3, M7): Live, Pause/Play, ×1 ×10 ×60 ×600,
 * a slider from −6 h to +72 h around the real current time, UTC display and
 * the far-from-epoch warning.
 */
import { useEffect, useMemo, useState } from 'react';
import { en } from '../i18n/en';
import { CLOCK } from '../config';
import { getSimDate, useClock } from '../store/simulationClock';
import { useOrbitalStore } from '../store/useOrbitalStore';
import { dataAgeDays } from '../orbital/derived';
import { fmtOffset } from './format';

/** Median epoch of the catalog, used for the warning when nothing is selected. */
function useReferenceEpoch(): number | null {
  const records = useOrbitalStore((s) => s.records);
  const selected = useOrbitalStore((s) => (s.selectedId === null ? undefined : s.byId.get(s.selectedId)));
  return useMemo(() => {
    if (selected) return selected.epoch.getTime();
    if (records.length === 0) return null;
    const epochs = records.map((r) => r.epoch.getTime()).sort((a, b) => a - b);
    return epochs[Math.floor(epochs.length / 2)]!;
  }, [records, selected]);
}

export function TimeControls() {
  const speed = useClock((s) => s.speed);
  const paused = useClock((s) => s.paused);
  const live = useClock((s) => s.live);
  const setSpeed = useClock((s) => s.setSpeed);
  const setPaused = useClock((s) => s.setPaused);
  const goLive = useClock((s) => s.goLive);
  const setSimTime = useClock((s) => s.setSimTime);
  const refEpoch = useReferenceEpoch();
  const [offsetH, setOffsetH] = useState(0);
  const [simMs, setSimMs] = useState(() => getSimDate().getTime());

  useEffect(() => {
    const id = window.setInterval(() => {
      const t = getSimDate().getTime();
      setSimMs(t);
      setOffsetH((t - Date.now()) / 3600_000);
    }, 250);
    return () => window.clearInterval(id);
  }, []);

  const farFromEpoch = refEpoch !== null && Math.abs(dataAgeDays(new Date(refEpoch), new Date(simMs))) > CLOCK.epochWarningDays;
  const clamped = Math.min(CLOCK.sliderMaxHours, Math.max(CLOCK.sliderMinHours, offsetH));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={`chip ${live ? 'chip-ok' : ''}`} onClick={goLive} aria-pressed={live}>
          ● {en.clock.live}
        </button>
        <button type="button" className="chip min-w-[64px]" onClick={() => setPaused(!paused)} aria-pressed={paused}>
          {paused ? `▶ ${en.clock.play}` : `❚❚ ${en.clock.pause}`}
        </button>
        <span className="label ml-1">{en.clock.speed}</span>
        {CLOCK.speeds.map((s) => (
          <button key={s} type="button" className={`chip mono ${speed === s && !paused ? 'chip-active' : ''}`} onClick={() => {
            setSpeed(s);
            if (paused) setPaused(false);
          }} aria-pressed={speed === s}>
            ×{s}
          </button>
        ))}
        <span className="mono ml-auto text-xs text-[var(--text-dim)]">{en.clock.offset(fmtOffset(offsetH * 3600_000))}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="mono text-[0.68rem] text-[var(--text-dim)]">{CLOCK.sliderMinHours}h</span>
        <input
          type="range"
          className="slider flex-1"
          min={CLOCK.sliderMinHours}
          max={CLOCK.sliderMaxHours}
          step={0.05}
          value={clamped}
          aria-label={en.clock.slider}
          onChange={(e) => setSimTime(Date.now() + Number(e.target.value) * 3600_000)}
        />
        <span className="mono text-[0.68rem] text-[var(--text-dim)]">+{CLOCK.sliderMaxHours}h</span>
      </div>
      {farFromEpoch && (
        <p className="text-xs font-medium text-[var(--warn)]" role="status">
          ⚠ {en.clock.farFromEpoch}
        </p>
      )}
    </div>
  );
}
