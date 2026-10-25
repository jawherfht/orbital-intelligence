/**
 * Every tunable parameter of the module lives here (SPEC §5, §1).
 * Values are documented defaults; change them here, never inline.
 */

/** WGS-84 equatorial radius, km. 1 scene unit = 1 Earth radius (SPEC §6.1). */
export const EARTH_RADIUS_KM = 6378.137;

/** Standard gravitational parameter of the Earth, km³/s² (SPEC §4.4). */
export const MU_EARTH_KM3_S2 = 398600.4418;

/** Camera limits, in Earth radii from the centre of the Earth. */
export const CAMERA = {
  initialDistance: 3.4,
  minDistance: 1.15,
  maxDistance: 14,
  fovDeg: 45,
} as const;

/** Simulation clock (SPEC §6.3). */
export const CLOCK = {
  speeds: [1, 10, 60, 600] as const,
  /** Slider range around "now", in hours. */
  sliderMinHours: -6,
  sliderMaxHours: 72,
  /** Warn when the simulated time is this far from the data epoch. */
  epochWarningDays: 7,
} as const;

/** Rendering limits (SPEC §6.2). */
export const RENDER = {
  maxRenderedObjects: 1500,
  /** Worker propagation rate, Hz. */
  propagationHz: 4,
  orbitPathPoints: 180,
} as const;

/** Data cache (SPEC §4.3). */
export const DATA = {
  liveCacheMaxAgeMs: 2 * 60 * 60 * 1000,
  snapshotPath: 'data',
  celestrakDevProxy: '/celestrak',
} as const;

/** Proximity screening defaults (SPEC §8.2, DECISIONS D7). */
export const SCREENING = {
  thresholdKmDefault: 10,
  thresholdKmMin: 1,
  thresholdKmMax: 50,
  /** Below this minimum distance the event is shown in red — always with "Requires Verification". */
  tightThresholdKm: 1,
  windowHoursDefault: 24,
  windowHoursMax: 72,
  coarseStepS: 30,
  altitudeMarginKm: 10,
} as const;

/** Debug markers used to check texture alignment (SPEC §6.1). */
export const DEBUG_MARKERS = [
  { id: 'null-island', label: '0°N 0°E', latDeg: 0, lonDeg: 0 },
  { id: 'tunis', label: 'Tunis 36.8°N 10.2°E', latDeg: 36.8, lonDeg: 10.2 },
] as const;

/** Orbit classes (SPEC §4.4). */
export const ORBIT_CLASS = {
  leoMaxAltKm: 2000,
  geoAltKm: 35786,
  /** Mean altitude within this distance of 35 786 km counts as GEO. */
  geoToleranceKm: 500,
  heoMinEccentricity: 0.25,
} as const;

/**
 * Groups downloaded by `npm run data:update` (SPEC §4.1).
 * `sample` keeps a deterministic subset of very large groups (every k-th object by NORAD id).
 * Groups are loaded in this order; an object present in several groups keeps the first.
 */
export const SNAPSHOT_GROUPS: readonly { group: string; label: string; sample?: number }[] = [
  { group: 'stations', label: 'Space stations' },
  { group: 'weather', label: 'Weather' },
  { group: 'resource', label: 'Earth resources' },
  { group: 'science', label: 'Science' },
  { group: 'gnss', label: 'GNSS' },
  { group: 'amateur', label: 'Amateur radio' },
  { group: 'geo', label: 'Geostationary' },
  { group: 'starlink', label: 'Starlink (sample)', sample: 400 },
];

/** Upstream URLs (SPEC §4.1, DECISIONS D20). */
export const SOURCES = {
  celestrakGroup: (group: string) => `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=JSON`,
  /**
   * Public GitHub mirror of CelesTrak GP data (TLE format), refreshed every
   * 30 min by a GitHub Actions workflow that downloads
   * celestrak.org/NORAD/elements/gp.php?GROUP=<group>&FORMAT=tle.
   * Used only when CelesTrak itself is unreachable.
   */
  mirrorRepo: 'https://github.com/2048lr/celestrak-mirror',
  mirrorRaw: 'https://raw.githubusercontent.com/2048lr/celestrak-mirror/main',
  /** Group → file in the mirror; groups absent from the mirror are skipped. */
  mirrorFiles: {
    stations: 'tle/stations.tle',
    weather: 'tle/weather.tle',
    resource: 'tle/resource.tle',
    science: 'tle/science.tle',
    amateur: 'tle/amateur.3le',
    geo: 'tle/geo.tle',
    starlink: 'tle/starlink.tle',
    oneweb: 'tle/oneweb.tle',
    military: 'tle/military.tle',
  } as Record<string, string>,
} as const;
