/**
 * Exportable root component (SPEC §5 "Point d'intégration").
 * Props not yet used in Phase 1 are accepted so the public API is stable.
 */
import { OrbitalScene } from './scene/OrbitalScene';
import { TopBar } from './ui/TopBar';
import { DebugOverlay } from './ui/DebugOverlay';

export interface OrbitalIntelligenceModuleProps {
  initialGroups?: string[];
  initialSelectedNoradId?: number;
  enableProximityScreening?: boolean;
  height?: string | number;
  onSatelliteSelect?: (noradId: number) => void;
}

export function OrbitalIntelligenceModule({ height = '100%' }: OrbitalIntelligenceModuleProps) {
  return (
    <div className="oi-root" style={{ height }}>
      <OrbitalScene />
      <div className="oi-overlay">
        <TopBar />
        <div className="mt-auto flex justify-end">
          <DebugOverlay />
        </div>
      </div>
    </div>
  );
}

export default OrbitalIntelligenceModule;
