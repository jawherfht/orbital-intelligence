/**
 * "Explain" panel (SPEC §8.3): deterministic explanations with
 * Computed / Reference badges.
 */
import { useEffect, useState } from 'react';
import { en } from '../i18n/en';
import { deterministicProvider, type ExplanationParagraph, type ExplanationProvider } from '../explain/ExplanationProvider';
import { useOrbitalStore } from '../store/useOrbitalStore';
import { activeEvent, useScreeningStore } from '../store/useScreeningStore';
import { getSimDate } from '../store/simulationClock';
import { stateAt } from '../orbital/propagate';

export function Badge({ kind }: { kind: ExplanationParagraph['kind'] }) {
  return <span className={`badge ${kind === 'computed' ? 'badge-computed' : 'badge-reference'}`}>{kind === 'computed' ? en.explain.computedBadge : en.explain.referenceBadge}</span>;
}

export function ExplainPanel({ provider = deterministicProvider }: { provider?: ExplanationProvider }) {
  const rec = useOrbitalStore((s) => (s.selectedId === null ? undefined : s.byId.get(s.selectedId)));
  const ev = useScreeningStore((s) => activeEvent(s));
  const thresholdKm = useScreeningStore((s) => s.lastRun?.thresholdKm ?? s.thresholdKm);
  const [paras, setParas] = useState<ExplanationParagraph[]>([]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (ev) return provider.explainEvent({ event: ev, thresholdKm });
      if (rec) {
        const at = getSimDate();
        return provider.explainSatellite({ record: rec, state: stateAt(rec.satrec, at), at });
      }
      return [];
    };
    void run().then((p) => {
      if (!cancelled) setParas(p);
    });
    return () => {
      cancelled = true;
    };
  }, [rec, ev, thresholdKm, provider]);

  return (
    <section className="flex flex-col gap-2 text-xs" aria-label={en.explain.title}>
      {paras.length === 0 ? (
        <p className="text-[var(--text-dim)]">{en.explain.nothing}</p>
      ) : (
        paras.map((p, i) => (
          <p key={i} className="leading-relaxed">
            <Badge kind={p.kind} /> {p.text}
          </p>
        ))
      )}
      <p className="label normal-case tracking-normal">{en.explain.providerNote}</p>
    </section>
  );
}
