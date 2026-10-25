/**
 * Multi-source verification of the selected object (DECISIONS D28).
 * Every number shown comes from a real API response or from SGP4 on a real
 * element set ("Computed"). When a source is unavailable the panel says so.
 */
import { useEffect, useMemo, useState } from 'react';
import { en } from '../i18n/en';
import { useOrbitalStore } from '../store/useOrbitalStore';
import { useVerificationStore, type SourceResult } from '../store/useVerificationStore';
import { getSimDate } from '../store/simulationClock';
import { ommToRecord } from '../data/catalog';
import { epochMs, freshness } from '../data/validation';
import { compareElementSets, compareWithN2yo } from '../orbital/compare';
import type { OmmRecord } from '../types/orbital';
import { Badge } from './ExplainPanel';
import { fmtDays, fmtLat, fmtLon, fmtUtc, fmtUtcTime } from './format';

const FRESH_COLOR: Record<string, string> = { fresh: 'var(--ok)', aging: 'var(--warn)', stale: 'var(--danger)', future: 'var(--danger)' };

function EpochLine({ omm }: { omm: OmmRecord }) {
  const f = freshness(omm.EPOCH);
  return (
    <div className="info-row">
      <dt className="text-[var(--text-dim)]">{en.verify.epoch}</dt>
      <dd className="mono text-right">
        {fmtUtc(epochMs(omm.EPOCH))}{' '}
        <span style={{ color: FRESH_COLOR[f.level] }}>
          ({fmtDays(f.ageDays)} d, {en.verify.freshness[f.level]})
        </span>
      </dd>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="info-row">
      <dt className="text-[var(--text-dim)]">{label}</dt>
      <dd className="mono text-right">{children}</dd>
    </div>
  );
}

function Meta({ r }: { r: SourceResult<unknown> }) {
  if (!r.fetchedAt) return null;
  return (
    <span className="label normal-case tracking-normal">
      {en.verify.fetched(fmtUtcTime(Date.parse(r.fetchedAt)))}
      {r.cached ? ` · ${en.verify.cached}` : ''}
    </span>
  );
}

function SourceMessage({ r, name, vars }: { r: SourceResult<unknown>; name: string; vars: string }) {
  if (r.status === 'loading') return <p className="text-[var(--text-dim)]">{en.verify.running}</p>;
  if (r.status !== 'error') return null;
  const text = r.code === 'server-down' ? en.verify.serverDown : r.code === 'not-configured' ? en.verify.notConfigured(name, vars) : r.error;
  return <p className={r.code === 'not-configured' ? 'text-[var(--text-dim)]' : 'text-[var(--warn)]'}>{text}</p>;
}

export function VerifyPanel() {
  const rec = useOrbitalStore((s) => (s.selectedId === null ? undefined : s.byId.get(s.selectedId)));
  const v = useVerificationStore();
  const [usedMsg, setUsedMsg] = useState(false);

  // Results belong to one object: clear them when the selected id changes
  // (not when the record object is replaced by a newer element set).
  const selectedId = rec?.noradId;
  const { noradId: verifiedId, reset } = v;
  useEffect(() => {
    if (selectedId !== undefined && verifiedId !== null && verifiedId !== selectedId) reset();
    setUsedMsg(false);
  }, [selectedId, verifiedId, reset]);

  const stCompare = useMemo(() => {
    if (!rec || v.spacetrack.status !== 'ok' || !v.spacetrack.data) return null;
    const other = ommToRecord(v.spacetrack.data, rec.group);
    if (!other) return null;
    return compareElementSets(rec.omm, rec.satrec, v.spacetrack.data, other.satrec, getSimDate().getTime());
  }, [rec, v.spacetrack]);

  const n2yoCheck = useMemo(() => {
    if (!rec || v.n2yo.status !== 'ok' || !v.n2yo.data) return null;
    return compareWithN2yo(rec.satrec, v.n2yo.data.positions);
  }, [rec, v.n2yo]);

  if (!rec) return null;
  if (rec.simulated) return <p className="banner-sim">{en.proximity.simulatedBanner}</p>;

  const busy = v.spacetrack.status === 'loading' || v.n2yo.status === 'loading';
  const ran = v.noradId === rec.noradId;
  const history = v.history.status === 'ok' ? v.history.data ?? [] : [];

  return (
    <section className="flex flex-col gap-3 text-xs" aria-label={en.verify.title}>
      <p className="text-[var(--text-dim)]">{en.verify.intro}</p>

      <div>
        <div className="label mb-1">{rec.elementSource === 'space-track' ? en.verify.primarySt : en.verify.primary}</div>
        <dl className="info-grid">
          <EpochLine omm={rec.omm} />
        </dl>
      </div>

      <button type="button" className="chip chip-accent justify-center" disabled={busy} onClick={() => void v.verify(rec.noradId)}>
        {busy ? en.verify.running : ran ? en.verify.rerun : en.verify.run}
      </button>

      {ran && (
        <>
          <div className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between">
              <span className="label">{en.verify.secondary}</span>
              <Meta r={v.spacetrack} />
            </div>
            <SourceMessage r={v.spacetrack} name="Space-Track" vars="SPACETRACK_IDENTITY and SPACETRACK_PASSWORD" />
            {v.spacetrack.status === 'ok' && v.spacetrack.data && stCompare && (
              <>
                <dl className="info-grid">
                  <EpochLine omm={v.spacetrack.data} />
                  <Row label={en.verify.epochDiff}>
                    {stCompare.sameElementSet
                      ? en.verify.same
                      : stCompare.epochDiffHours >= 0
                        ? en.verify.newer(stCompare.epochDiffHours.toFixed(1))
                        : en.verify.older(Math.abs(stCompare.epochDiffHours).toFixed(1))}
                  </Row>
                  <Row label={en.verify.dIncl}>{stCompare.dInclinationDeg.toFixed(4)}°</Row>
                  <Row label={en.verify.dRaan}>{stCompare.dRaanDeg.toFixed(4)}°</Row>
                  <Row label={en.verify.dMm}>{stCompare.dMeanMotionRevDay.toExponential(2)} rev/d</Row>
                  <Row label={en.verify.posDiff}>
                    <Badge kind="computed" /> {stCompare.positionDiffKm === null ? '—' : `${stCompare.positionDiffKm.toFixed(2)} km`}
                  </Row>
                </dl>
                {stCompare.epochDiffHours > 0.5 && !stCompare.sameElementSet && rec.elementSource !== 'space-track' && (
                  <button
                    type="button"
                    className="chip justify-center"
                    onClick={() => {
                      if (v.useSpaceTrackElements()) setUsedMsg(true);
                    }}
                  >
                    {en.verify.useSt}
                  </button>
                )}
                {usedMsg && <p className="text-[var(--ok)]">{en.verify.usedSt}</p>}
                {v.history.status === 'idle' && (
                  <button type="button" className="link self-start" onClick={() => void v.loadHistory(rec.noradId)}>
                    {en.verify.loadHistory}
                  </button>
                )}
              </>
            )}
            {v.history.status === 'loading' && <p className="text-[var(--text-dim)]">{en.verify.running}</p>}
            {v.history.status === 'error' && <p className="text-[var(--warn)]">{v.history.error}</p>}
            {history.length > 0 && (
              <div>
                <div className="label mt-1">{en.verify.history}</div>
                <ul className="mono mt-1 flex flex-col gap-0.5">
                  {history.map((h, i) => {
                    const next = history[i + 1];
                    const gapH = next ? (epochMs(h.EPOCH) - epochMs(next.EPOCH)) / 3_600_000 : null;
                    return (
                      <li key={`${h.EPOCH}-${i}`} className="flex justify-between gap-2">
                        <span>{fmtUtc(epochMs(h.EPOCH))}</span>
                        <span className="text-[var(--text-dim)]">{gapH === null ? '' : `+${gapH.toFixed(1)} h`}</span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-1 text-[var(--text-dim)]">{en.verify.historyNote}</p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between">
              <span className="label">{en.verify.positions}</span>
              <Meta r={v.n2yo} />
            </div>
            <SourceMessage r={v.n2yo} name="N2YO" vars="N2YO_API_KEY" />
            {n2yoCheck && n2yoCheck.samples > 0 && (
              <>
                <dl className="info-grid">
                  <Row label={en.verify.samples(n2yoCheck.samples)}>{v.n2yo.data?.info.satname}</Row>
                  {n2yoCheck.first && (
                    <>
                      <Row label={`N2YO ${fmtUtcTime(n2yoCheck.first.timestampMs)}`}>
                        {fmtLat(n2yoCheck.first.n2yo.lat)} {fmtLon(n2yoCheck.first.n2yo.lon)} · {n2yoCheck.first.n2yo.altKm.toFixed(1)} km
                      </Row>
                      <Row label="SGP4 (ours)">
                        {fmtLat(n2yoCheck.first.sgp4.lat)} {fmtLon(n2yoCheck.first.sgp4.lon)} · {n2yoCheck.first.sgp4.altKm.toFixed(1)} km
                      </Row>
                    </>
                  )}
                  <Row label={en.verify.meanH}>
                    <Badge kind="computed" /> {n2yoCheck.meanHorizontalKm.toFixed(2)} km
                  </Row>
                  <Row label={en.verify.maxH}>{n2yoCheck.maxHorizontalKm.toFixed(2)} km</Row>
                  <Row label={en.verify.dAlt}>{n2yoCheck.meanAltitudeDiffKm.toFixed(2)} km</Row>
                </dl>
                <p className="text-[var(--text-dim)]">{en.verify.n2yoNote}</p>
              </>
            )}
          </div>

          {v.serverStatus && (
            <p className="label normal-case tracking-normal">
              Space-Track: {en.verify.usage(v.serverStatus.spacetrack.requestsLastHour, v.serverStatus.spacetrack.hourlyLimit)} · N2YO:{' '}
              {en.verify.usage(v.serverStatus.n2yo.transactionsLastHour, v.serverStatus.n2yo.hourlyLimit)}
            </p>
          )}
        </>
      )}
    </section>
  );
}
