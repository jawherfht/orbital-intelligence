import { en } from '../i18n/en';
import { useDemoStore } from '../store/useDemoStore';

/** On-screen caption of the demo scenario (SPEC §10). */
export function DemoCaption() {
  const caption = useDemoStore((s) => s.caption);
  const step = useDemoStore((s) => s.step);
  if (caption === null) return null;
  const text = caption === -1 ? en.demo.done : en.demo.steps[caption];
  return (
    <div className="panel demo-caption pointer-events-auto" role="status" aria-live="polite">
      {caption !== -1 && (
        <span className="mono mr-2 text-[var(--accent)]">
          {step + 1}/{en.demo.steps.length}
        </span>
      )}
      {text}
    </div>
  );
}
