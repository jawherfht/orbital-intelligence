import { useEffect, useState } from 'react';
import { en } from '../i18n/en';
import { getSimDate } from '../store/simulationClock';
import { useUiStore } from '../store/useUiStore';

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

export function TopBar() {
  const debug = useUiStore((s) => s.debug);
  const toggleDebug = useUiStore((s) => s.toggleDebug);
  return (
    <header className="panel pointer-events-auto flex items-center justify-between gap-3 px-3 py-2 sm:gap-4 sm:px-4 sm:py-2.5">
      <div className="flex items-center gap-3 min-w-0">
        <span className="status-dot" aria-hidden />
        <div className="min-w-0">
          <h1 className="title">{en.app.title}</h1>
          <p className="label truncate hidden sm:block">{en.app.subtitle}</p>
        </div>
      </div>
      <div className="hidden md:block label">{en.topBar.dataSourceNone}</div>
      <div className="flex items-center gap-3">
        <UtcClock />
        <button
          type="button"
          className={`chip ${debug ? 'chip-active' : ''}`}
          onClick={toggleDebug}
          aria-pressed={debug}
        >
          {en.debug.toggle}
        </button>
      </div>
    </header>
  );
}
