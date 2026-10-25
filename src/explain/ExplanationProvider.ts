/**
 * Explanations (SPEC §8.3).
 *
 * `ExplanationProvider` is the plug-in point for a future assistant (e.g. a
 * simple RAG over the Methods & Limitations texts). The MVP ships only the
 * deterministic provider below: sentences are templated from computed values.
 * Every paragraph is tagged so the UI can show "Computed" vs "Reference"
 * badges — a future LLM provider must keep that distinction.
 */
import type { CloseApproachEvent } from '../screening/closeApproach';
import type { SatelliteRecord, StateVector } from '../types/orbital';
import { dataAgeDays, deriveElements } from '../orbital/derived';
import { SCREENING } from '../config';
import { fmtDays, fmtUtc } from '../ui/format';

export interface ExplanationParagraph {
  /** "computed": built from values calculated by this module. "reference": generic documentation. */
  kind: 'computed' | 'reference';
  text: string;
}

export interface SatelliteContext {
  record: SatelliteRecord;
  state: StateVector | null;
  at: Date;
}

export interface EventContext {
  event: CloseApproachEvent;
  thresholdKm: number;
}

export interface ExplanationProvider {
  readonly name: string;
  explainSatellite(ctx: SatelliteContext): Promise<ExplanationParagraph[]>;
  explainEvent(ctx: EventContext): Promise<ExplanationParagraph[]>;
}

const ORBIT_WORDS = {
  LEO: 'low Earth orbit',
  MEO: 'medium Earth orbit',
  GEO: 'geostationary orbit',
  HEO: 'a highly elliptical orbit',
} as const;

/** Rough SGP4 accuracy wording by data age (see docs/METHODOLOGY.md). */
export function accuracyWording(ageDays: number): string {
  const a = Math.abs(ageDays);
  if (a < 1) return 'roughly a kilometre to a few kilometres';
  if (a < 3) return 'roughly a few kilometres';
  if (a < 7) return 'several kilometres to tens of kilometres';
  return 'tens of kilometres or more — strongly degraded';
}

export const deterministicProvider: ExplanationProvider = {
  name: 'deterministic',

  async explainSatellite({ record, state, at }) {
    const d = deriveElements(record.meanMotionRevPerDay, record.eccentricity);
    const age = dataAgeDays(record.epoch, at);
    const alt = state ? `about ${Math.round(state.altKm).toLocaleString('en-US')} km altitude` : `a mean altitude of about ${Math.round((d.apogeeKm + d.perigeeKm) / 2).toLocaleString('en-US')} km`;
    const out: ExplanationParagraph[] = [
      {
        kind: 'computed',
        text: `${record.name} is in ${ORBIT_WORDS[d.orbitClass]} at ${alt}, with an inclination of ${record.inclinationDeg.toFixed(1)}°. One revolution takes ${d.periodMin.toFixed(1)} minutes.`,
      },
      {
        kind: 'computed',
        text: `Its position is estimated with the SGP4 model from orbital elements dated ${fmtDays(Math.abs(age))} day${Math.abs(age) >= 0.95 && Math.abs(age) < 1.05 ? '' : 's'} ${age >= 0 ? 'before' : 'after'} the displayed time (epoch ${fmtUtc(record.epoch.getTime(), false)}). Expected accuracy: ${accuracyWording(age)}.`,
      },
    ];
    if (record.inclinationDeg > 96 && record.inclinationDeg < 102 && d.orbitClass === 'LEO') {
      out.push({ kind: 'reference', text: 'An inclination near 98° in low orbit usually indicates a Sun-synchronous orbit, common for Earth-observation and weather satellites: it passes over each place at about the same local solar time.' });
    }
    if (d.orbitClass === 'GEO') {
      out.push({ kind: 'reference', text: 'A geostationary satellite completes one orbit per sidereal day (≈1 436 min), so it appears fixed above the equator to an observer on the ground.' });
    }
    out.push({ kind: 'reference', text: 'Inclination is the angle between the orbital plane and the equator: 0° follows the equator, 90° passes over the poles, above 90° the orbit is retrograde.' });
    out.push({ kind: 'reference', text: 'The displayed positions are estimates, not measurements. Public orbital elements are dated fits of tracking data; accuracy degrades as the computed time moves away from the data epoch.' });
    return out;
  },

  async explainEvent({ event, thresholdKm }) {
    const tight = event.minDistanceKm < SCREENING.tightThresholdKm;
    const out: ExplanationParagraph[] = [
      {
        kind: 'computed',
        text: `${event.primaryName} and ${event.secondaryName} reach a minimum computed distance of ${event.minDistanceKm.toFixed(2)} km at ${fmtUtc(event.tcaMs)}, with a relative speed of ${event.relSpeedKmS.toFixed(2)} km/s. This is below the screening threshold of ${thresholdKm} km${tight ? `, and below the tight ${SCREENING.tightThresholdKm} km level` : ''}.`,
      },
      {
        kind: 'computed',
        text: `At the TCA the element sets are ${fmtDays(event.primaryAgeDays)} and ${fmtDays(event.secondaryAgeDays)} days old. Expected position errors for each object: ${accuracyWording(Math.max(Math.abs(event.primaryAgeDays), Math.abs(event.secondaryAgeDays)))}. The true miss distance can therefore differ substantially from the computed one.`,
      },
      {
        kind: 'reference',
        text: 'A minimum computed distance is not a probability of collision. Assessing risk requires position uncertainty (covariance), which public GP data does not include. Operators rely on Conjunction Data Messages and their own ephemerides before deciding on any manoeuvre.',
      },
    ];
    if (event.simulated) out.unshift({ kind: 'reference', text: 'This event comes from the SIMULATED TEST SCENARIO: two synthetic objects built to cross. It is not real data.' });
    return out;
  },
};
