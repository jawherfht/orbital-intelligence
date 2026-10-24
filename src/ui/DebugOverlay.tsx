import { en } from '../i18n/en';
import { DEBUG_MARKERS } from '../config';
import { useUiStore } from '../store/useUiStore';

export function DebugOverlay() {
  const debug = useUiStore((s) => s.debug);
  const fps = useUiStore((s) => s.fps);
  if (!debug) return null;
  return (
    <div className="panel pointer-events-auto px-3 py-2 text-xs">
      <div className="flex items-baseline gap-2">
        <span className="label">{en.debug.fps}</span>
        <span className={`mono text-base ${fps >= 50 ? 'text-[var(--ok)]' : 'text-[var(--warn)]'}`}>{fps}</span>
      </div>
      <div className="label mt-1">{en.debug.markers}</div>
      <ul className="mono text-[var(--text-dim)]">
        {DEBUG_MARKERS.map((m) => (
          <li key={m.id}>● {m.label}</li>
        ))}
      </ul>
    </div>
  );
}
