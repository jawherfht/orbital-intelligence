import { useEffect, useState } from 'react';
import { en } from '../i18n/en';
import { getSimDate } from '../store/simulationClock';
import { useUiStore } from '../store/useUiStore';
import { useOrbitalStore } from '../store/useOrbitalStore';
import { useScreeningStore } from '../store/useScreeningStore';
import { useDemoStore } from '../store/useDemoStore';
import type { DataSourceInfo } from '../types/orbital';
import { fmtUtc } from './format';
import { AgentButton } from './DecisionPanel';

function formatUtc(d: Date): { date: string; time: string } {
  const iso = d.toISOString();
  return { date: iso.slice(0, 10), time: `${iso.slice(11, 19)} ${en.topBar.utc}` };
}

function UtcClock() {
  const [now, setNow] = useState(() => getSimDate());
  useEffect(() => {
    const id = window.setInterval(() => setNow(getSimDate()), 250);
    return () => window.clearInterval(id);
  }, []);
  const { date, time } = formatUtc(now);
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className="label hidden sm:block">{en.topBar.simulatedTime}</span>
      <span className="mono text-xs sm:text-sm text-[var(--text)] whitespace-nowrap">
        <span className="hidden sm:inline">{date} </span>
        {time}
      </span>
      <span className="mono text-[0.68rem] text-[var(--text-dim)] sm:hidden">{date}</span>
    </div>
  );
}

export function sourceLabel(source: DataSourceInfo | null): string {
  if (!source) return en.topBar.dataSourceNone;
  const t = Date.parse(source.fetchedAt);
  switch (source.kind) {
    case 'snapshot':
      return `${en.topBar.dataSourceSnapshot(fmtUtc(t, false))}${source.origin.includes('mirror') ? ` (${en.topBar.viaMirror})` : ''}`;
    case 'live':
      return en.topBar.dataSourceLive(fmtUtc(t, false));
    case 'live-mirror':
      return en.topBar.dataSourceLiveMirror(fmtUtc(t, false));
    case 'cache':
      return en.topBar.dataSourceCache(fmtUtc(t, false));
  }
}

function DataSource() {
  const status = useOrbitalStore((s) => s.status);
  const source = useOrbitalStore((s) => s.source);
  const count = useOrbitalStore((s) => s.records.filter((r) => !r.simulated).length);
  const skipped = useOrbitalStore((s) => s.skipped);
  const refreshing = useOrbitalStore((s) => s.refreshing);
  const refreshLive = useOrbitalStore((s) => s.refreshLive);
  const [note, setNote] = useState<string | null>(null);

  const onRefresh = async () => {
    setNote(null);
    const r = await refreshLive();
    setNote(r === 'failed' ? en.topBar.refreshFailed : r === 'cache' ? en.topBar.refreshCached : null);
  };

  return (
    <div className="hidden min-w-0 flex-col items-center leading-tight lg:flex">
      <span className="label hidden max-w-[520px] truncate 2xl:block" title={source?.origin}>
        {status === 'loading' ? en.topBar.dataSourceLoading : sourceLabel(source)}
      </span>
      <span className="mono text-[0.68rem] text-[var(--text-dim)]">
        {status === 'ready' && en.topBar.objects(count)}
        {skipped > 0 && <span className="text-[var(--warn)]"> · {en.topBar.skipped(skipped)}</span>}
        {note && <span className="text-[var(--warn)]"> · {note}</span>}
        {status === 'ready' && (
          <button type="button" className="link ml-2" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? en.topBar.refreshing : en.topBar.refresh}
          </button>
        )}
      </span>
    </div>
  );
}

export function TopBar() {
  const debug = useUiStore((s) => s.debug);
  const toggleDebug = useUiStore((s) => s.toggleDebug);
  const setLimitationsOpen = useScreeningStore((s) => s.setLimitationsOpen);
  const demoRunning = useDemoStore((s) => s.running);
  const startDemo = useDemoStore((s) => s.start);
  const stopDemo = useDemoStore((s) => s.stop);
  return (
    <header className="panel pointer-events-auto flex items-center justify-between gap-3 px-3 py-2 sm:gap-4 sm:px-4 sm:py-2.5">
      <div className="flex items-center gap-3 min-w-0">
        <span className="status-dot" aria-hidden />
        <div className="min-w-0">
          <h1 className="title">{en.app.title}</h1>
          <p className="label truncate hidden sm:block">{en.app.subtitle}</p>
        </div>
      </div>
      <DataSource />
      <div className="flex items-center gap-2 sm:gap-3">
        <button type="button" className={`chip ${demoRunning ? 'chip-active' : 'chip-accent'}`} onClick={demoRunning ? stopDemo : startDemo}>
          {demoRunning ? en.topBar.stopDemo : en.topBar.demo}
        </button>
        <AgentButton />
        <button type="button" className="chip hidden sm:inline-flex" onClick={() => setLimitationsOpen(true)}>
          {en.topBar.methods}
        </button>
        <UtcClock />
        <button type="button" className={`chip hidden sm:inline-flex ${debug ? 'chip-active' : ''}`} onClick={toggleDebug} aria-pressed={debug}>
          {en.debug.toggle}
        </button>
      </div>
    </header>
  );
}
