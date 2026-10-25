/**
 * Hover tooltip (SPEC §6.4): name, NORAD id, estimated altitude.
 */
import { useOrbitalStore } from '../store/useOrbitalStore';
import { getSimDate } from '../store/simulationClock';
import { stateAt } from '../orbital/propagate';
import { en } from '../i18n/en';
import { fmtKm } from './format';

export function HoverTooltip() {
  const hoveredId = useOrbitalStore((s) => s.hoveredId);
  const pos = useOrbitalStore((s) => s.hoverScreen);
  const rec = useOrbitalStore((s) => (s.hoveredId === null ? undefined : s.byId.get(s.hoveredId)));
  if (hoveredId === null || !pos || !rec) return null;
  const st = stateAt(rec.satrec, getSimDate());
  return (
    <div className="tooltip" style={{ left: pos.x + 14, top: pos.y + 14 }} role="tooltip">
      <div className="font-semibold">{rec.name}</div>
      <div className="mono text-[var(--text-dim)]">
        NORAD {rec.noradId}
        {st && ` · ${fmtKm(st.altKm, 0)}`}
      </div>
      <div className="label">{en.positions.estimated}</div>
    </div>
  );
}
