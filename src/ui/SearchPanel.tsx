/**
 * Satellite search (SPEC M4): partial name (case-insensitive) or exact NORAD id,
 * keyboard navigation (↑ ↓ Enter Esc).
 */
import { useMemo, useState } from 'react';
import { en } from '../i18n/en';
import { CATEGORY_COLORS } from '../config';
import { useOrbitalStore } from '../store/useOrbitalStore';
import { searchCatalog } from '../data/catalog';

export function SearchPanel() {
  const records = useOrbitalStore((s) => s.records);
  const select = useOrbitalStore((s) => s.select);
  const selectedId = useOrbitalStore((s) => s.selectedId);
  const query = useOrbitalStore((s) => s.searchQuery);
  const setQuery = useOrbitalStore((s) => s.setSearchQuery);
  const [cursor, setCursor] = useState(0);

  const results = useMemo(() => searchCatalog(records, query, 50), [records, query]);
  const q = query.trim();

  const choose = (id: number) => {
    select(id);
    setQuery('');
    setCursor(0);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(results.length - 1, c + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === 'Enter') {
      const r = results[cursor];
      if (r) choose(r.noradId);
    } else if (e.key === 'Escape') {
      setQuery('');
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <input
          type="search"
          className="input w-full pl-8"
          placeholder={en.search.placeholder}
          aria-label={en.search.placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls="oi-search-results"
          aria-activedescendant={results[cursor] ? `oi-res-${results[cursor].noradId}` : undefined}
        />
        <svg className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-dim)]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </div>
      {q === '' ? (
        selectedId === null && <p className="text-xs text-[var(--text-dim)]">{en.search.hint}</p>
      ) : results.length === 0 ? (
        <p className="text-xs text-[var(--warn)]">{en.search.noResult(q)}</p>
      ) : (
        <>
          <span className="label">{en.search.results(results.length)}</span>
          <ul id="oi-search-results" role="listbox" className="scroll-thin max-h-56 overflow-y-auto">
            {results.map((r, i) => (
              <li key={r.noradId} id={`oi-res-${r.noradId}`} role="option" aria-selected={i === cursor}>
                <button
                  type="button"
                  className={`result-row ${i === cursor ? 'result-row-active' : ''}`}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => choose(r.noradId)}
                >
                  <span className="swatch" style={{ background: CATEGORY_COLORS[r.category] }} aria-hidden />
                  <span className="truncate">{r.name}</span>
                  <span className="mono ml-auto text-[var(--text-dim)]">{r.noradId}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
