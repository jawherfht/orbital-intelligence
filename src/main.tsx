import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './styles.css';
import { OrbitalIntelligenceModule } from './OrbitalIntelligenceModule';
import { useClock } from './store/simulationClock';

// Demo/debug convenience: ?t=2026-10-25T12:00:00Z starts the clock at that UTC instant.
const startAt = new URLSearchParams(window.location.search).get('t');
if (startAt && !Number.isNaN(Date.parse(startAt))) useClock.getState().setSimTime(Date.parse(startAt));

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

createRoot(root).render(
  <StrictMode>
    <OrbitalIntelligenceModule height="100dvh" />
  </StrictMode>,
);
