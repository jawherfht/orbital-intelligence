/**
 * "Why does this need verification?" / Methods & Limitations (SPEC §8.3).
 */
import { useEffect, useRef } from 'react';
import { en } from '../i18n/en';
import { useScreeningStore } from '../store/useScreeningStore';
import { Badge } from './ExplainPanel';

export function LimitationsModal() {
  const open = useScreeningStore((s) => s.limitationsOpen);
  const setOpen = useScreeningStore((s) => s.setLimitationsOpen);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div className="panel modal" role="dialog" aria-modal="true" aria-labelledby="oi-lim-title" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h2 id="oi-lim-title" className="text-base font-semibold">
            {en.limitations.title}
          </h2>
          <button ref={closeRef} type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label={en.limitations.close}>
            ×
          </button>
        </div>
        <div className="scroll-thin mt-3 flex max-h-[65vh] flex-col gap-3 overflow-y-auto pr-1 text-sm">
          {en.limitations.sections.map((s) => (
            <section key={s.heading}>
              <h3 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
                {s.heading} <Badge kind="reference" />
              </h3>
              <p className="leading-relaxed text-[var(--text)]">{s.body}</p>
            </section>
          ))}
          <p className="text-xs text-[var(--text-dim)]">
            <a className="link" href={en.limitations.reference_url} target="_blank" rel="noreferrer">
              {en.limitations.reference_link}
            </a>
            {' · '}
            <a className="link" href={en.limitations.celestrak_url} target="_blank" rel="noreferrer">
              {en.limitations.celestrak_link}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
