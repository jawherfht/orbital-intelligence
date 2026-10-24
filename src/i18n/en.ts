/**
 * All user-facing strings (SPEC §2.4, DECISIONS D1).
 * Vocabulary rules of SPEC §2.3 are enforced by src/i18n/__tests__/vocabulary.test.ts.
 */
export const en = {
  app: {
    title: 'ORBITAL INTELLIGENCE',
    subtitle: 'Satellite Tracking & Proximity Monitoring',
  },
  topBar: {
    utc: 'UTC',
    simulatedTime: 'Simulated time',
    dataSourceNone: 'Data source: not loaded yet',
    dataSourceSnapshot: (date: string) => `Data source: snapshot of ${date}`,
    dataSourceLive: (time: string) => `Data source: CelesTrak live, fetched ${time}`,
  },
  clock: {
    live: 'Live',
    pause: 'Pause',
    play: 'Play',
    speed: 'Speed',
    farFromEpoch: 'Propagation far from data epoch — accuracy degraded',
  },
  debug: {
    toggle: 'Debug',
    fps: 'FPS',
    markers: 'Alignment markers',
  },
  positions: {
    estimated: 'Estimated position (SGP4)',
  },
  proximity: {
    alertTitle: 'Potential Close Approach — Requires Verification',
    minDistance: 'Minimum computed distance',
    flagged: 'Close approach flagged for review',
    whyVerify: 'Why does this need verification?',
    simulatedBanner: 'SIMULATED TEST SCENARIO — NOT REAL DATA',
  },
  satellite: {
    categoryInferred: 'Category (inferred)',
  },
} as const;

export type Strings = typeof en;
