/**
 * Technical sheet of the selected object (SPEC M5), refreshed at 4 Hz from
 * a direct SGP4 evaluation at the simulated time.
 */
import { useEffect, useMemo, useState } from 'react';
import { en } from '../i18n/en';
import { CATEGORY_COLORS, CLOCK } from '../config';
import { useOrbitalStore } from '../store/useOrbitalStore';
import { getSimDate } from '../store/simulationClock';
import { stateAt } from '../orbital/propagate';
import { dataAgeDays, deriveElements } from '../orbital/derived';
import type { StateVector } from '../types/orbital';
import { fmtDays, fmtKm, fmtLat, fmtLon, fmtNum, fmtUtc } from './format';
import { useScreeningStore } from '../store/useScreeningStore';

function Row({ label, children, title }: { label: string; children: React.ReactNode; title?: string }) {
  return (
    <div className="info-row" title={title}>
      <dt className="text-[var(--text-dim)]">{label}</dt>
      <dd className="mono text-right">{children}</dd>
    </div>
  );
}

export function SatelliteInfoPanel({ onExplain }: { onExplain: () => void }) {
  const selectedId = useOrbitalStore((s) => s.selectedId);
  const rec = useOrbitalStore((s) => (s.selectedId === null ? undefined : s.byId.get(s.selectedId)));
  const select = useOrbitalStore((s) => s.select);
  const requestFocus = useOrbitalStore((s) => s.requestFocus);
  const setMode = useScreeningStore((s) => s.setMode);
  const runScreening = useScreeningStore((s) => s.run);
  const [state, setState] = useState<StateVector | null>(null);
  const [now, setNow] = useState(() => getSimDate());

  useEffect(() => {
    if (!rec) return;
    const tick = () => {
      const d = getSimDate();
      setNow(d);
      setState(stateAt(rec.satrec, d));
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [rec]);

  const derived = useMemo(() => (rec ? deriveElements(rec.meanMotionRevPerDay, rec.eccentricity) : null), [rec]);
  if (selectedId === null || !rec || !derived) return null;

  const age = dataAgeDays(rec.epoch, now);
  const absAge = Math.abs(age);
  const validity = absAge < 3 ? en.info.validityGood : absAge <= CLOCK.epochWarningDays ? en.info.validityFair : en.info.validityPoor;
  const validityColor = absAge < 3 ? 'var(--ok)' : absAge <= CLOCK.epochWarningDays ? 'var(--warn)' : 'var(--danger)';

  return (
    <section className="flex flex-col gap-2" aria-label={en.info.title}>
      <div className="flex items-start gap-2">
        <span className="swatch mt-1.5" style={{ background: CATEGORY_COLORS[rec.category] }} aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{rec.name}</h2>
          <p className="label">{en.positions.estimated}</p>
        </div>
        <button type="button" className="icon-btn" onClick={() => select(null)} aria-label={en.info.close} title={en.info.close}>
          ×
        </button>
      </div>
      {rec.simulated && <div className="banner-sim">{en.proximity.simulatedBanner}</div>}
      <dl className="info-grid">
        <Row label={en.info.norad}>{rec.noradId}</Row>
        <Row label={en.info.intl}>{rec.intlDesignator ?? '—'}</Row>
        <Row label={en.info.category}>{en.categories[rec.category]}</Row>
        <Row label={en.info.group}>{rec.group}</Row>
        {state ? (
          <>
            <Row label={en.info.altitude}>{fmtKm(state.altKm)}</Row>
            <Row label={en.info.latLon}>
              {fmtLat(state.latDeg)} {fmtLon(state.lonDeg)}
            </Row>
            <Row label={en.info.speed}>{fmtNum(state.speedKmS, 3)} km/s</Row>
          </>
        ) : (
          <p className="col-span-2 text-xs text-[var(--danger)]">{en.info.propagationFailed}</p>
        )}
        <Row label={en.info.inclination}>{fmtNum(rec.inclinationDeg, 2)}°</Row>
        <Row label={en.info.eccentricity}>{rec.eccentricity.toFixed(5)}</Row>
        <Row label={en.info.period}>{fmtNum(derived.periodMin, 1)} min</Row>
        <Row label={en.info.apogeePerigee}>
          {fmtNum(derived.apogeeKm, 0)} / {fmtNum(derived.perigeeKm, 0)} km
        </Row>
        <Row label={en.info.orbitClass}>{derived.orbitClass}</Row>
      </dl>
      <div className="rounded-md border border-[var(--panel-border)] p-2 text-xs">
        <div className="flex justify-between gap-2">
          <span className="text-[var(--text-dim)]">{en.info.epoch}</span>
          <span className="mono text-right">{fmtUtc(rec.epoch.getTime())}</span>
        </div>
        <div className="mono mt-0.5 text-right" style={{ color: validityColor }}>
          ({en.info.age(fmtDays(age))})
        </div>
        <p className="mt-1 text-[var(--text-dim)]">
          <span className="font-medium" style={{ color: validityColor }}>
            {en.info.validity}:
          </span>{' '}
          {validity}
        </p>
        <p className="mt-1 text-[var(--text-dim)]">{en.info.trajectory}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="chip" onClick={requestFocus}>
          {en.info.focus}
        </button>
        <button type="button" className="chip" onClick={onExplain}>
          {en.info.explain}
        </button>
        <button
          type="button"
          className="chip chip-warn"
          onClick={() => {
            setMode('selected');
            void runScreening();
          }}
        >
          {en.info.screen}
        </button>
      </div>
    </section>
  );
}
