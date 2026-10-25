import { useEffect, useState } from 'react';
import { en } from '../i18n/en';
import { DEBUG_MARKERS } from '../config';
import { useUiStore } from '../store/useUiStore';
import { swarm } from '../scene/swarmEngine';

export function DebugOverlay() {
  const debug = useUiStore((s) => s.debug);
  const fps = useUiStore((s) => s.fps);
  const [interp, setInterp] = useState(0);
  useEffect(() => {
    if (!debug) return;
    const id = window.setInterval(() => setInterp(swarm.interpErrorKm), 500);
    return () => window.clearInterval(id);
  }, [debug]);
  if (!debug) return null;
  return (
    <div className="panel pointer-events-auto px-3 py-2 text-xs">
      <div className="flex items-baseline gap-2">
        <span className="label">{en.debug.fps}</span>
        <span className={`mono text-base ${fps >= 50 ? 'text-[var(--ok)]' : 'text-[var(--warn)]'}`}>{fps}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="label">{en.debug.interpolation}</span>
        <span className={`mono ${interp < 5 ? 'text-[var(--ok)]' : 'text-[var(--warn)]'}`}>{interp < 0.001 ? '< 1 m' : `${interp.toFixed(3)} km`}</span>
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
