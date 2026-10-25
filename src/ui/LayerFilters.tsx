/**
 * Layer filters (SPEC §6.4): categories, CelesTrak groups, orbit / ground track.
 */
import { useMemo } from 'react';
import { en } from '../i18n/en';
import { CATEGORY_COLORS, SNAPSHOT_GROUPS } from '../config';
import { CATEGORIES } from '../types/orbital';
import { useOrbitalStore } from '../store/useOrbitalStore';
import { sourceLabel } from './TopBar';

export function LayerFilters() {
  const records = useOrbitalStore((s) => s.records);
  const groups = useOrbitalStore((s) => s.groups);
  const source = useOrbitalStore((s) => s.source);
  const hiddenCategories = useOrbitalStore((s) => s.hiddenCategories);
  const hiddenGroups = useOrbitalStore((s) => s.hiddenGroups);
  const toggleCategory = useOrbitalStore((s) => s.toggleCategory);
  const toggleGroup = useOrbitalStore((s) => s.toggleGroup);
  const showOrbit = useOrbitalStore((s) => s.showOrbit);
  const showGroundTrack = useOrbitalStore((s) => s.showGroundTrack);
  const setShowOrbit = useOrbitalStore((s) => s.setShowOrbit);
  const setShowGroundTrack = useOrbitalStore((s) => s.setShowGroundTrack);

  const counts = useMemo(() => {
    const cat = new Map<string, number>();
    const grp = new Map<string, number>();
    for (const r of records) {
      cat.set(r.category, (cat.get(r.category) ?? 0) + 1);
      grp.set(r.group, (grp.get(r.group) ?? 0) + 1);
    }
    return { cat, grp };
  }, [records]);

  return (
    <div className="flex flex-col gap-3 text-xs">
      <p className="label lg:hidden">{sourceLabel(source)}</p>
      <div>
        <div className="label mb-1.5">{en.layers.categories}</div>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.filter((c) => counts.cat.get(c)).map((c) => (
            <button key={c} type="button" className={`chip ${hiddenCategories.has(c) ? 'opacity-45' : ''}`} onClick={() => toggleCategory(c)} aria-pressed={!hiddenCategories.has(c)}>
              <span className="swatch" style={{ background: CATEGORY_COLORS[c] }} aria-hidden />
              {en.categories[c]} <span className="mono text-[var(--text-dim)]">{counts.cat.get(c)}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="label mb-1.5">{en.layers.groups}</div>
        <div className="flex flex-wrap gap-1.5">
          {groups.map((g) => (
            <button key={g} type="button" className={`chip ${hiddenGroups.has(g) ? 'opacity-45' : ''}`} onClick={() => toggleGroup(g)} aria-pressed={!hiddenGroups.has(g)}>
              {SNAPSHOT_GROUPS.find((x) => x.group === g)?.label ?? g} <span className="mono text-[var(--text-dim)]">{counts.grp.get(g) ?? 0}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="toggle">
          <input type="checkbox" checked={showOrbit} onChange={(e) => setShowOrbit(e.target.checked)} />
          {en.layers.orbit}
        </label>
        <label className="toggle">
          <input type="checkbox" checked={showGroundTrack} onChange={(e) => setShowGroundTrack(e.target.checked)} />
          {en.layers.groundTrack}
        </label>
      </div>
    </div>
  );
}
