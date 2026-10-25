/**
 * Proximity Monitoring (SPEC O1): screening parameters, progress/cancel,
 * event list with mandatory fields (§2.3), distance chart for the active event.
 */
import { useMemo } from 'react';
import { en } from '../i18n/en';
import { COLORS, SCREENING, SNAPSHOT_GROUPS } from '../config';
import { useOrbitalStore } from '../store/useOrbitalStore';
import { activeEvent, useScreeningStore } from '../store/useScreeningStore';
import type { CloseApproachEvent } from '../screening/closeApproach';
import { DistanceChart } from './DistanceChart';
import { fmtDays, fmtUtc } from './format';

function EventCard({ ev, active, onOpen }: { ev: CloseApproachEvent; active: boolean; onOpen: () => void }) {
  const setLimitationsOpen = useScreeningStore((s) => s.setLimitationsOpen);
  const tight = ev.minDistanceKm < SCREENING.tightThresholdKm;
  const color = tight ? COLORS.tight : COLORS.approach;
  return (
    <li className={`event-card ${active ? 'event-card-active' : ''}`} style={{ borderColor: active ? color : undefined }}>
      <button type="button" className="w-full text-left" onClick={onOpen}>
        <div className="text-[0.7rem] font-semibold uppercase tracking-wide" style={{ color }}>
          {en.proximity.alertTitle}
        </div>
        {ev.simulated && <div className="banner-sim mt-1">{en.proximity.simulatedBanner}</div>}
        <div className="mt-1 truncate text-xs">
          {ev.primaryName} <span className="text-[var(--text-dim)]">×</span> {ev.secondaryName}
        </div>
        <dl className="event-grid mono">
          <dt>{en.proximity.minDistance}</dt>
          <dd style={{ color }}>{ev.minDistanceKm.toFixed(2)} km</dd>
          <dt>{en.proximity.tca}</dt>
          <dd>{fmtUtc(ev.tcaMs)}</dd>
          <dt>{en.proximity.relSpeed}</dt>
          <dd>{ev.relSpeedKmS.toFixed(2)} km/s</dd>
          <dt>{en.proximity.dataAge}</dt>
          <dd>
            {fmtDays(ev.primaryAgeDays)} d / {fmtDays(ev.secondaryAgeDays)} d
          </dd>
        </dl>
      </button>
      <button type="button" className="link mt-1 text-xs" onClick={() => setLimitationsOpen(true)}>
        {en.proximity.whyVerify}
      </button>
    </li>
  );
}

export function ProximityPanel() {
  const groups = useOrbitalStore((s) => s.groups);
  const selected = useOrbitalStore((s) => (s.selectedId === null ? undefined : s.byId.get(s.selectedId)));
  const st = useScreeningStore();
  const ev = activeEvent(st);
  const groupOptions = useMemo(() => groups.filter((g) => g !== 'simulated'), [groups]);
  const running = st.status === 'running';

  return (
    <div className="flex flex-col gap-3 text-xs">
      {st.simulatedActive && <div className="banner-sim">{en.proximity.simulatedBanner}</div>}
      <fieldset className="flex flex-col gap-2" disabled={running}>
        <div className="flex gap-1.5">
          <button type="button" className={`chip flex-1 ${st.mode === 'selected' ? 'chip-active' : ''}`} onClick={() => st.setMode('selected')}>
            {en.proximity.modeSelected}
          </button>
          <button type="button" className={`chip flex-1 ${st.mode === 'group' ? 'chip-active' : ''}`} onClick={() => st.setMode('group')}>
            {en.proximity.modeGroup}
          </button>
        </div>
        {st.mode === 'selected' ? (
          <p className="text-[var(--text-dim)]">{selected ? `${selected.name} · ≤ ${SCREENING.maxOthers} objects` : en.proximity.selectFirst}</p>
        ) : (
          <label className="flex items-center justify-between gap-2">
            <span className="text-[var(--text-dim)]">{en.proximity.group}</span>
            <select className="input py-1" value={st.group} onChange={(e) => st.setGroup(e.target.value)}>
              {groupOptions.map((g) => (
                <option key={g} value={g}>
                  {SNAPSHOT_GROUPS.find((x) => x.group === g)?.label ?? g}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex items-center gap-2">
          <span className="w-20 text-[var(--text-dim)]">{en.proximity.threshold}</span>
          <input
            type="range"
            className="slider flex-1"
            min={SCREENING.thresholdKmMin}
            max={SCREENING.thresholdKmMax}
            step={1}
            value={st.thresholdKm}
            onChange={(e) => st.setThreshold(Number(e.target.value))}
          />
          <span className="mono w-12 text-right">{st.thresholdKm} km</span>
        </label>
        <label className="flex items-center gap-2">
          <span className="w-20 text-[var(--text-dim)]">{en.proximity.window}</span>
          <select className="input flex-1 py-1" value={st.windowHours} onChange={(e) => st.setWindow(Number(e.target.value))}>
            {[6, 12, 24, 48, 72].map((h) => (
              <option key={h} value={h}>
                {h} h
              </option>
            ))}
          </select>
        </label>
      </fieldset>
      <div className="flex gap-2">
        {running ? (
          <>
            <div className="progress flex-1" role="progressbar" aria-valuenow={Math.round(st.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div style={{ width: `${Math.round(st.progress * 100)}%` }} />
              <span>{en.proximity.running(Math.round(st.progress * 100))}</span>
            </div>
            <button type="button" className="chip" onClick={st.cancel}>
              {en.proximity.cancel}
            </button>
          </>
        ) : (
          <button type="button" className="chip chip-warn flex-1 justify-center" onClick={() => void st.run()} disabled={st.mode === 'selected' && !selected && !st.simulatedActive}>
            {en.proximity.run}
          </button>
        )}
      </div>
      {st.status === 'error' && <p className="text-[var(--danger)]">{st.error === 'select-first' ? en.proximity.selectFirst : st.error}</p>}
      {st.stats && (
        <div className="text-[var(--text-dim)]">
          <p className="mono">{en.proximity.summary(st.stats.pairsTotal, st.stats.pairsAfterPrefilter, st.stats.durationMs)}</p>
          {st.stats.colocatedExcluded > 0 && <p>{en.proximity.colocated(st.stats.colocatedExcluded)}</p>}
          {st.capped && <p>{en.proximity.capped(st.mode === 'group' ? SCREENING.maxGroupObjects : SCREENING.maxOthers)}</p>}
        </div>
      )}
      {st.status === 'done' && st.events.length === 0 && st.lastRun && (
        <div className="flex flex-col gap-2">
          <p>{en.proximity.none(st.lastRun.thresholdKm, st.lastRun.windowHours)}</p>
          {!st.simulatedActive && (
            <button type="button" className="chip justify-center" onClick={() => void st.runSimulated()}>
              {en.proximity.simulatedRun}
            </button>
          )}
        </div>
      )}
      {st.events.length > 0 && (
        <>
          <span className="label">{en.proximity.events(st.events.length)}</span>
          <ul className="scroll-thin flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
            {st.events.map((e) => (
              <EventCard key={e.id} ev={e} active={e.id === st.activeEventId} onOpen={() => st.openEvent(e.id)} />
            ))}
          </ul>
        </>
      )}
      {ev && <DistanceChart event={ev} thresholdKm={st.lastRun?.thresholdKm ?? st.thresholdKm} />}
      {st.simulatedActive && (
        <button type="button" className="chip justify-center" onClick={st.clearSimulated}>
          {en.proximity.clearSimulated}
        </button>
      )}
      <p className="text-[0.68rem] leading-snug text-[var(--text-dim)]">{en.proximity.disclaimer}</p>
    </div>
  );
}
