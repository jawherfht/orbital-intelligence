/**
 * Exportable root component (SPEC §5 "Point d'intégration").
 *
 * Layout (SPEC §7): top bar; top-left Proximity Monitoring; top-right
 * Satellites (search + sheet / explain); bottom time controls + event
 * timeline; bottom-right layers. Below 900 px the panels become drawers.
 */
import { useEffect, useRef, useState } from 'react';
import { OrbitalScene } from './scene/OrbitalScene';
import { TopBar } from './ui/TopBar';
import { DebugOverlay } from './ui/DebugOverlay';
import { SearchPanel } from './ui/SearchPanel';
import { SatelliteInfoPanel } from './ui/SatelliteInfoPanel';
import { ExplainPanel } from './ui/ExplainPanel';
import { VerifyPanel } from './ui/VerifyPanel';
import { TimeControls } from './ui/TimeControls';
import { LayerFilters } from './ui/LayerFilters';
import { ProximityPanel } from './ui/ProximityPanel';
import { EventTimeline } from './ui/EventTimeline';
import { LimitationsModal } from './ui/LimitationsModal';
import { AgentModal } from './ui/DecisionPanel';
import { HoverTooltip } from './ui/HoverTooltip';
import { DemoCaption } from './ui/DemoCaption';
import { useOrbitalStore } from './store/useOrbitalStore';
import { useUiStore } from './store/useUiStore';
import { useScreeningStore } from './store/useScreeningStore';
import { en } from './i18n/en';

export interface OrbitalIntelligenceModuleProps {
  /** CelesTrak groups to load from the snapshot, e.g. ['stations', 'weather']. Default: all groups of the manifest. */
  initialGroups?: string[];
  /** Object selected once the data is loaded, e.g. 25544 (ISS). */
  initialSelectedNoradId?: number;
  /** Shows the Proximity Monitoring panel and event timeline. Default true. */
  enableProximityScreening?: boolean;
  height?: string | number;
  onSatelliteSelect?: (noradId: number) => void;
}

/**
 * Floating panel. Desktop: collapsible to its header. Narrow screens: a drawer
 * shown only when `open`, closed with the × button.
 */
function Panel({ title, open, onToggle, className = '', children }: { title: string; open: boolean; onToggle: () => void; className?: string; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <section className={`panel drawer pointer-events-auto flex min-h-0 flex-col ${open ? 'drawer-open' : ''} ${collapsed ? 'panel-collapsed' : ''} ${className}`} aria-label={title}>
      <header className={`flex items-center justify-between gap-2 px-3 py-2 ${collapsed ? '' : 'border-b border-[var(--panel-border)]'}`}>
        <h2 className="text-sm font-semibold">{title}</h2>
        <div className="flex items-center gap-1">
          <button type="button" className="icon-btn drawer-collapse" onClick={() => setCollapsed(!collapsed)} aria-expanded={!collapsed} aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${title}`}>
            {collapsed ? '+' : '–'}
          </button>
          <button type="button" className="icon-btn drawer-close" onClick={onToggle} aria-label={`Close ${title}`}>
            ×
          </button>
        </div>
      </header>
      <div className="panel-body scroll-thin min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
    </section>
  );
}

function SatellitesPanel() {
  const open = useUiStore((s) => s.rightOpen);
  const setOpen = useUiStore((s) => s.setRightOpen);
  const tab = useUiStore((s) => s.rightTab);
  const setTab = useUiStore((s) => s.setRightTab);
  const selectedId = useOrbitalStore((s) => s.selectedId);
  return (
    <Panel title={en.search.title} open={open} onToggle={() => setOpen(false)} className="oi-right">
      <div className="flex flex-col gap-3">
        <SearchPanel />
        {selectedId !== null && (
          <div className="flex gap-1.5" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'info'} className={`chip flex-1 justify-center ${tab === 'info' ? 'chip-active' : ''}`} onClick={() => setTab('info')}>
              {en.info.title}
            </button>
            <button type="button" role="tab" aria-selected={tab === 'explain'} className={`chip flex-1 justify-center ${tab === 'explain' ? 'chip-active' : ''}`} onClick={() => setTab('explain')}>
              {en.explain.title}
            </button>
            <button type="button" role="tab" aria-selected={tab === 'verify'} className={`chip flex-1 justify-center ${tab === 'verify' ? 'chip-active' : ''}`} onClick={() => setTab('verify')}>
              {en.verify.tab}
            </button>
          </div>
        )}
        {tab === 'info' || selectedId === null ? <SatelliteInfoPanel onExplain={() => setTab('explain')} /> : tab === 'explain' ? <ExplainPanel /> : <VerifyPanel />}
      </div>
    </Panel>
  );
}

function MobileToggles({ proximity }: { proximity: boolean }) {
  const ui = useUiStore();
  const setLimitationsOpen = useScreeningStore((s) => s.setLimitationsOpen);
  return (
    <div className="mobile-toggles pointer-events-auto">
      {proximity && (
        <button type="button" className={`chip ${ui.leftOpen ? 'chip-active' : ''}`} onClick={() => ui.setLeftOpen(!ui.leftOpen)}>
          {en.proximity.panelTitle}
        </button>
      )}
      <button type="button" className={`chip ${ui.rightOpen ? 'chip-active' : ''}`} onClick={() => ui.setRightOpen(!ui.rightOpen)}>
        {en.search.title}
      </button>
      <button type="button" className={`chip ${ui.layersOpen ? 'chip-active' : ''}`} onClick={() => ui.setLayersOpen(!ui.layersOpen)}>
        {en.layers.title}
      </button>
      <button type="button" className="chip" onClick={() => setLimitationsOpen(true)}>
        {en.topBar.methods}
      </button>
    </div>
  );
}

export function OrbitalIntelligenceModule({ initialGroups, initialSelectedNoradId, enableProximityScreening = true, height = '100%', onSatelliteSelect }: OrbitalIntelligenceModuleProps) {
  const status = useOrbitalStore((s) => s.status);
  const error = useOrbitalStore((s) => s.error);
  const selectedId = useOrbitalStore((s) => s.selectedId);
  const ui = useUiStore();
  const initialSelectionDone = useRef(false);

  useEffect(() => {
    void useOrbitalStore.getState().loadInitial(initialGroups);
    // Groups are an initial value only.
  }, []);

  useEffect(() => {
    if (status !== 'ready' || initialSelectionDone.current) return;
    initialSelectionDone.current = true;
    if (initialSelectedNoradId !== undefined && useOrbitalStore.getState().byId.has(initialSelectedNoradId)) {
      useOrbitalStore.getState().select(initialSelectedNoradId);
    }
  }, [status, initialSelectedNoradId]);

  useEffect(() => {
    if (selectedId !== null) {
      onSatelliteSelect?.(selectedId);
      // On narrow screens, show the sheet when something gets selected.
      if (window.matchMedia('(max-width: 899px)').matches) useUiStore.getState().setRightOpen(true);
    }
  }, [selectedId, onSatelliteSelect]);

  return (
    <div className="oi-root" style={{ height }}>
      <OrbitalScene />
      <div className="oi-overlay">
        <TopBar />
        <MobileToggles proximity={enableProximityScreening} />
        <div className="oi-main">
          {enableProximityScreening ? (
            <Panel title={en.proximity.panelTitle} open={ui.leftOpen} onToggle={() => ui.setLeftOpen(false)} className="oi-left">
              <ProximityPanel />
            </Panel>
          ) : (
            <div className="oi-left-spacer" />
          )}
          <div className="oi-center">
            <DemoCaption />
            {status === 'loading' && <div className="panel pointer-events-auto px-4 py-2 text-sm">{en.loading.data}</div>}
            {status === 'error' && (
              <div className="panel pointer-events-auto px-4 py-2 text-sm text-[var(--danger)]">
                {en.loading.failed} {error}
              </div>
            )}
          </div>
          <SatellitesPanel />
        </div>
        <div className="oi-bottom">
          <div className="panel pointer-events-auto flex flex-1 flex-col gap-3 px-3 py-2.5">
            <TimeControls />
            {enableProximityScreening && <EventTimeline />}
          </div>
          <Panel title={en.layers.title} open={ui.layersOpen} onToggle={() => ui.setLayersOpen(false)} className="oi-layers">
            <LayerFilters />
          </Panel>
          <div className="oi-debug">
            <DebugOverlay />
          </div>
        </div>
      </div>
      <HoverTooltip />
      <LimitationsModal />
      <AgentModal />
    </div>
  );
}

export default OrbitalIntelligenceModule;
