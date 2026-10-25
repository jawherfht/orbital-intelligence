/**
 * Event timeline (SPEC O2): screened events on the screening window, plus
 * the current simulated time. Clicking an event jumps the clock to its TCA.
 */
import { useEffect, useState } from 'react';
import { en } from '../i18n/en';
import { COLORS, SCREENING } from '../config';
import { useScreeningStore } from '../store/useScreeningStore';
import { getSimDate } from '../store/simulationClock';
import { fmtUtc } from './format';

export function EventTimeline() {
  const events = useScreeningStore((s) => s.events);
  const lastRun = useScreeningStore((s) => s.lastRun);
  const activeId = useScreeningStore((s) => s.activeEventId);
  const openEvent = useScreeningStore((s) => s.openEvent);
  const [now, setNow] = useState(() => getSimDate().getTime());
  useEffect(() => {
    const id = window.setInterval(() => setNow(getSimDate().getTime()), 250);
    return () => window.clearInterval(id);
  }, []);

  if (!lastRun) return null;
  const start = lastRun.startMs;
  const end = start + lastRun.windowHours * 3600_000;
  const pct = (t: number) => `${Math.min(100, Math.max(0, ((t - start) / (end - start)) * 100))}%`;
  const hours = Array.from({ length: Math.floor(lastRun.windowHours / 6) + 1 }, (_, i) => i * 6);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="label">{en.proximity.timelineTitle}</span>
        <span className="mono text-[0.68rem] text-[var(--text-dim)]">
          {fmtUtc(start, false)} → +{lastRun.windowHours}h
        </span>
      </div>
      <div className="timeline" role="list">
        {hours.map((h) => (
          <span key={h} className="timeline-tick" style={{ left: pct(start + h * 3600_000) }}>
            <span>+{h}h</span>
          </span>
        ))}
        {now >= start && now <= end && <span className="timeline-now" style={{ left: pct(now) }} aria-hidden />}
        {events.length === 0 && <span className="timeline-empty">{en.proximity.timelineEmpty}</span>}
        {events.map((e) => {
          const color = e.minDistanceKm < SCREENING.tightThresholdKm ? COLORS.tight : COLORS.approach;
          return (
            <button
              key={e.id}
              type="button"
              role="listitem"
              className={`timeline-event ${e.id === activeId ? 'timeline-event-active' : ''}`}
              style={{ left: pct(e.tcaMs), background: color, boxShadow: `0 0 8px ${color}` }}
              title={`${e.primaryName} × ${e.secondaryName} — ${e.minDistanceKm.toFixed(2)} km — ${fmtUtc(e.tcaMs)}`}
              aria-label={`${en.proximity.flagged}: ${e.primaryName} × ${e.secondaryName}, ${e.minDistanceKm.toFixed(2)} km, ${fmtUtc(e.tcaMs)}`}
              onClick={() => openEvent(e.id)}
            />
          );
        })}
      </div>
    </div>
  );
}
