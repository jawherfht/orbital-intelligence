/**
 * Decision agent UI (DECISIONS D29): recommendation per event, human
 * approval / rejection, automatic execution below the tight distance, and
 * the history of every decision.
 */
import { useEffect, useMemo, useState } from 'react';
import { en } from '../i18n/en';
import { AGENT, COLORS } from '../config';
import type { CloseApproachEvent } from '../screening/closeApproach';
import type { DecisionRecord, DecisionStatus } from '../types/agent';
import { decisionFor, useAgentStore } from '../store/useAgentStore';
import { useScreeningStore } from '../store/useScreeningStore';
import { fmtUtc } from './format';

const STATUS_COLOR: Record<DecisionStatus, string> = {
  pending: COLORS.approach,
  approved: 'var(--ok)',
  rejected: 'var(--text-dim)',
  'auto-executed': COLORS.tight,
};

function StatusBadge({ status }: { status: DecisionStatus }) {
  return (
    <span className="badge" style={{ color: STATUS_COLOR[status], border: `1px solid ${STATUS_COLOR[status]}` }}>
      {en.agent.status[status]}
    </span>
  );
}

function ChosenOption({ d }: { d: DecisionRecord }) {
  const opt = d.options.find((o) => o.id === d.recommendation.optionId);
  if (!opt) return null;
  return (
    <div>
      <div className="font-medium">{opt.label}</div>
      {opt.kind === 'along_track_burn' && (
        <div className="mono text-[0.68rem] text-[var(--text-dim)]">
          {en.agent.dv(String(opt.deltaVMs))} · {en.agent.burnAt(fmtUtc(opt.burnTimeMs ?? 0, false))} · {en.agent.estMiss(String(opt.estimatedMissKm))}
        </div>
      )}
    </div>
  );
}

function DecidedBy({ d }: { d: DecisionRecord }) {
  const r = d.recommendation;
  return (
    <span className="label normal-case tracking-normal">
      {r.decidedBy === 'rules' ? en.agent.rules(r.fallbackReason ?? '') : en.agent.by(r.decidedBy)} · {en.agent.urgency[r.urgency]}
    </span>
  );
}

function ApprovalControls({ d }: { d: DecisionRecord }) {
  const resolve = useAgentStore((s) => s.resolve);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const act = async (outcome: 'approve' | 'reject') => {
    setBusy(true);
    await resolve(d.id, outcome, comment.trim());
    setBusy(false);
  };
  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      <input className="input py-1 text-xs" placeholder={en.agent.comment} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} aria-label={en.agent.comment} />
      <div className="flex gap-1.5">
        <button type="button" className="chip chip-ok flex-1 justify-center" disabled={busy} onClick={() => void act('approve')}>
          {en.agent.approve}
        </button>
        <button type="button" className="chip flex-1 justify-center" disabled={busy} onClick={() => void act('reject')}>
          {en.agent.reject}
        </button>
      </div>
    </div>
  );
}

/** Agent block inside an event card. */
export function AgentInline({ ev, thresholdKm }: { ev: CloseApproachEvent; thresholdKm: number }) {
  const decisions = useAgentStore((s) => s.decisions);
  const analysing = useAgentStore((s) => s.analysing.has(ev.id));
  const error = useAgentStore((s) => s.errors[ev.id]);
  const analyse = useAgentStore((s) => s.analyse);
  const d = decisionFor(decisions, ev.id);

  if (analysing) return <p className="mt-1.5 text-xs text-[var(--text-dim)]">{en.agent.analysing}</p>;
  if (!d)
    return (
      <div className="mt-1.5">
        <button type="button" className="chip chip-accent" onClick={() => void analyse(ev, thresholdKm)}>
          {en.agent.ask}
        </button>
        {error && <p className="mt-1 text-xs text-[var(--warn)]">{error}</p>}
      </div>
    );
  return (
    <div className="mt-2 rounded-md border border-[var(--panel-border)] p-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="label">{en.agent.recommends}</span>
        <StatusBadge status={d.status} />
      </div>
      <ChosenOption d={d} />
      <p className="mt-1 leading-snug">{d.recommendation.rationale}</p>
      {d.recommendation.caveats && <p className="mt-1 leading-snug text-[var(--text-dim)]">{d.recommendation.caveats}</p>}
      <DecidedBy d={d} />
      <p className="mt-1 text-[0.68rem] text-[var(--text-dim)]">{d.policy}</p>
      {d.status === 'pending' && <ApprovalControls d={d} />}
    </div>
  );
}

/** Pending approvals + full history. */
export function DecisionLog() {
  const decisions = useAgentStore((s) => s.decisions);
  const historyError = useAgentStore((s) => s.historyError);
  const refresh = useAgentStore((s) => s.refresh);
  const [filter, setFilter] = useState<'all' | DecisionStatus>('all');

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const pending = decisions.filter((d) => d.status === 'pending');
  const shown = useMemo(() => decisions.filter((d) => filter === 'all' || d.status === filter), [decisions, filter]);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(decisions, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `decisions-${new Date().toISOString().slice(0, 19).replace(/:/g, '')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section className="flex flex-col gap-2 text-xs" aria-label={en.agent.title}>
      <div className="flex items-baseline justify-between">
        <span className="label">{en.agent.title}</span>
        {decisions.length > 0 && (
          <button type="button" className="link text-[0.68rem]" onClick={exportJson}>
            {en.agent.export}
          </button>
        )}
      </div>
      <p className="text-[0.68rem] leading-snug text-[var(--text-dim)]">
        {en.agent.policy(AGENT.autoExecuteKm)} {en.agent.simulatedNote}
      </p>
      {historyError && <p className="text-[var(--warn)]">{historyError}</p>}
      {pending.length > 0 && <p className="font-medium" style={{ color: COLORS.approach }}>{en.agent.pending(pending.length)}</p>}
      {decisions.length === 0 ? (
        <p className="text-[var(--text-dim)]">{en.agent.empty}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1">
            {(['all', 'pending', 'approved', 'rejected', 'auto-executed'] as const).map((f) => (
              <button key={f} type="button" className={`chip ${filter === f ? 'chip-active' : ''}`} onClick={() => setFilter(f)}>
                {f === 'all' ? en.agent.filterAll : en.agent.status[f]} <span className="mono">{f === 'all' ? decisions.length : decisions.filter((d) => d.status === f).length}</span>
              </button>
            ))}
          </div>
          <ul className="flex flex-col gap-1.5">
            {shown.map((d) => (
              <li key={d.id} className="rounded-md border border-[var(--panel-border)] p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    {d.event.primary.name} × {d.event.secondary.name}
                  </span>
                  <StatusBadge status={d.status} />
                </div>
                <div className="mono text-[0.68rem] text-[var(--text-dim)]">
                  {d.event.minDistanceKm.toFixed(2)} km · TCA {fmtUtc(d.event.tcaMs, false)}
                  {d.event.simulated && ' · SIMULATED'}
                </div>
                <ChosenOption d={d} />
                <DecidedBy d={d} />
                {d.resolvedAt && (
                  <div className="text-[0.68rem] text-[var(--text-dim)]">
                    {en.agent.resolvedBy(d.resolvedBy === 'auto-policy' ? en.agent.autoPolicy : en.agent.operator, fmtUtc(d.resolvedAt))}
                    {d.comment && ` — “${d.comment}”`}
                  </div>
                )}
                {d.status === 'pending' && <ApprovalControls d={d} />}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Top-bar button with the number of decisions awaiting approval. */
export function AgentButton() {
  const pending = useAgentStore((s) => s.decisions.filter((d) => d.status === 'pending').length);
  const setOpen = useAgentStore((s) => s.setOpen);
  const refresh = useAgentStore((s) => s.refresh);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return (
    <button type="button" className={`chip ${pending ? 'chip-warn' : 'chip-accent'}`} onClick={() => setOpen(true)} aria-label={`${en.agent.button}${pending ? `, ${en.agent.pending(pending)}` : ''}`}>
      {en.agent.button}
      {pending > 0 && <span className="agent-count">{pending}</span>}
    </button>
  );
}

/** Full agent window: LLM status, events of the last screening with their decisions, history. */
export function AgentModal() {
  const open = useAgentStore((s) => s.open);
  const setOpen = useAgentStore((s) => s.setOpen);
  const status = useAgentStore((s) => s.status);
  const analyse = useAgentStore((s) => s.analyse);
  const events = useScreeningStore((s) => s.events);
  const thresholdKm = useScreeningStore((s) => s.lastRun?.thresholdKm ?? s.thresholdKm);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open) return null;
  const sorted = [...events].sort((a, b) => a.minDistanceKm - b.minDistanceKm);
  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div className="panel modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="oi-agent-title" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="oi-agent-title" className="text-base font-semibold">
              {en.agent.windowTitle}
            </h2>
            <p className={`mt-0.5 text-xs ${status?.configured ? 'text-[var(--ok)]' : 'text-[var(--warn)]'}`}>
              {status === null ? en.agent.serverOff : status.configured ? en.agent.llmOn(status.model) : en.agent.llmOff}
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label={en.agent.close}>
            ×
          </button>
        </div>
        <div className="scroll-thin mt-3 grid max-h-[72vh] gap-4 overflow-y-auto pr-1 md:grid-cols-2">
          <section className="flex flex-col gap-2 text-xs">
            <div className="flex items-baseline justify-between gap-2">
              <span className="label">{en.agent.current}</span>
              {sorted.length > 1 && (
                <button type="button" className="link text-[0.68rem]" onClick={() => void (async () => { for (const ev of sorted) await analyse(ev, thresholdKm); })()}>
                  {en.agent.analyseAll}
                </button>
              )}
            </div>
            {sorted.length === 0 && <p className="text-[var(--text-dim)]">{en.agent.noEvents}</p>}
            {sorted.map((ev) => (
              <div key={ev.id} className="event-card">
                <div className="text-[0.7rem] font-semibold uppercase tracking-wide" style={{ color: ev.minDistanceKm < AGENT.autoExecuteKm ? COLORS.tight : COLORS.approach }}>
                  {en.proximity.alertTitle}
                </div>
                {ev.simulated && <div className="banner-sim mt-1">{en.proximity.simulatedBanner}</div>}
                <div className="mt-1 truncate">
                  {ev.primaryName} × {ev.secondaryName}
                </div>
                <div className="mono text-[0.68rem] text-[var(--text-dim)]">
                  {ev.minDistanceKm.toFixed(2)} km · TCA {fmtUtc(ev.tcaMs)} · {ev.relSpeedKmS.toFixed(2)} km/s
                </div>
                <AgentInline ev={ev} thresholdKm={thresholdKm} />
              </div>
            ))}
          </section>
          <DecisionLog />
        </div>
      </div>
    </div>
  );
}
