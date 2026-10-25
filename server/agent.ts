/**
 * Decision agent for potential close approaches (DECISIONS D29).
 *
 *   1. The code computes the possible actions (monitor, ask for a tracking
 *      update, along-track burns sized for target miss distances).
 *   2. gpt-4o-mini picks ONE option id and explains why (strict JSON schema).
 *      It cannot invent numbers: the reply is rejected unless the id exists.
 *   3. A deterministic policy decides who acts: below AGENT.autoExecuteKm the
 *      recommendation is executed automatically (simulated); otherwise it
 *      waits for a human approval or rejection.
 * If the LLM is unavailable, a rule-based choice is used and labelled as such.
 *
 * Executions are simulated: this dashboard does not command any spacecraft.
 */
import { AGENT } from '../src/config.ts';
import type { AgentEventContext, AgentOption, AgentRecommendation, DecisionStatus, Urgency } from '../src/types/agent.ts';

export const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
/** Bump when options or policy change, so older decisions are not reused for new requests. */
export const AGENT_POLICY_VERSION = 2;
const MANEUVERABLE = new Set(['payload', 'station']);

/**
 * Along-track Δv needed to shift the encounter by `missKm` after `leadS`
 * seconds. First-order Clohessy–Wiltshire secular drift: Δx ≈ 3·Δv·t.
 */
export function alongTrackDeltaV(missKm: number, leadS: number): number {
  return (missKm * 1000) / (3 * leadS);
}

/** Decision tier from the minimum computed distance (DECISIONS D29). */
export function tierOf(ctx: AgentEventContext): Urgency {
  if (ctx.minDistanceKm < AGENT.autoExecuteKm) return 'critical';
  if (ctx.minDistanceKm < AGENT.burnConsiderKm) return 'elevated';
  return 'routine';
}

function burnOptions(ctx: AgentEventContext, side: AgentEventContext['primary'], key: 'p' | 's'): AgentOption[] {
  if (!MANEUVERABLE.has(side.category)) return [];
  const burnTimeMs = Math.max(ctx.nowMs + 10 * 60_000, ctx.tcaMs - 2 * 3_600_000);
  const leadS = (ctx.tcaMs - burnTimeMs) / 1000;
  if (leadS < AGENT.minLeadMinutes * 60) return [];
  const out: AgentOption[] = [];
  for (const target of AGENT.targetMissKm) {
    if (target <= ctx.minDistanceKm) continue;
    const dv = alongTrackDeltaV(target, leadS);
    if (dv > AGENT.maxDeltaVMs) continue;
    out.push({
      id: `burn_${key}_${target}km`,
      kind: 'along_track_burn',
      label: `Along-track burn of ${dv.toFixed(3)} m/s on ${side.name}, ${(leadS / 3600).toFixed(1)} h before TCA`,
      deltaVMs: Number(dv.toFixed(4)),
      burnTimeMs,
      estimatedMissKm: target,
    });
  }
  return out;
}

/**
 * Actions the agent may choose from, with computed values only. What is
 * offered depends on the tier, so the LLM cannot pick a passive action for a
 * very close approach:
 *   critical (< autoExecuteKm): burns only (if no object can manoeuvre: monitor + data request);
 *   elevated (< burnConsiderKm): burns, monitor, and a tracking update if the TCA is far enough;
 *   routine: monitor, and a tracking update if the TCA is far enough.
 * Burns are computed for whichever object can manoeuvre (payload or station).
 */
export function computeOptions(ctx: AgentEventContext): AgentOption[] {
  const tier = tierOf(ctx);
  const burns = [...burnOptions(ctx, ctx.primary, 'p'), ...burnOptions(ctx, ctx.secondary, 's')];
  const hoursToTca = (ctx.tcaMs - ctx.nowMs) / 3_600_000;
  const maxAge = Math.max(ctx.primary.dataAgeDays, ctx.secondary.dataAgeDays);
  const monitor: AgentOption = { id: 'monitor', kind: 'monitor', label: 'Keep monitoring; re-screen when new element sets are published' };
  const update: AgentOption = {
    id: 'request_update',
    kind: 'request_tracking_update',
    label: `Request fresher tracking data and re-screen (oldest element set: ${maxAge.toFixed(1)} days; TCA in ${hoursToTca.toFixed(1)} h)`,
  };
  const updateUseful = hoursToTca >= AGENT.updateMinLeadHours;
  if (tier === 'critical') return burns.length ? burns : [monitor, update];
  if (tier === 'elevated') return [...burns, monitor, ...(updateUseful ? [update] : [])];
  return [monitor, ...(updateUseful ? [update] : [])];
}

/** Deterministic choice used when the LLM is unavailable. */
export function ruleBasedChoice(ctx: AgentEventContext, options: AgentOption[], reason: string): AgentRecommendation {
  const tier = tierOf(ctx);
  const burns = options.filter((o) => o.kind === 'along_track_burn');
  const maxAge = Math.max(ctx.primary.dataAgeDays, ctx.secondary.dataAgeDays);
  // Smallest Δv reaching the largest target among burns.
  const best = [...burns].sort((a, b) => (b.estimatedMissKm ?? 0) - (a.estimatedMissKm ?? 0) || (a.deltaVMs ?? 0) - (b.deltaVMs ?? 0))[0];
  let optionId = 'monitor';
  if (tier !== 'routine' && best) optionId = best.id;
  else if (options.some((o) => o.id === 'request_update') && maxAge > AGENT.staleDataDays) optionId = 'request_update';
  else if (!options.some((o) => o.id === 'monitor')) optionId = options[0]!.id;
  return {
    optionId,
    urgency: tier,
    rationale: `Rule-based choice: minimum computed distance ${ctx.minDistanceKm.toFixed(2)} km, oldest element set ${maxAge.toFixed(1)} days.`,
    caveats: 'Distances come from public element sets without covariance; true miss distance can differ by kilometres.',
    decidedBy: 'rules',
    fallbackReason: reason,
  };
}

/** Who acts (DECISIONS D29). */
export function applyPolicy(ctx: AgentEventContext): { status: DecisionStatus; policy: string } {
  if (ctx.minDistanceKm < AGENT.autoExecuteKm) {
    return { status: 'auto-executed', policy: `Minimum computed distance below ${AGENT.autoExecuteKm} km: executed automatically (simulated), recorded for review.` };
  }
  return { status: 'pending', policy: `Minimum computed distance ≥ ${AGENT.autoExecuteKm} km: human approval required.` };
}

const SYSTEM_PROMPT = `You are a decision-support agent for a satellite-tracking prototype.
A screening found a "Potential Close Approach — Requires Verification" between two catalogued objects.
Choose exactly ONE action from the provided options (by its id) and explain why in 2-4 sentences.
The options were already filtered by distance tier (given as "tier"):
- critical (< 1 km): only burns are offered; choose the burn that best protects the pair (larger margin first, then lower delta-v).
- elevated (1-5 km): a burn is normally the right protective action; choose monitoring or a data request only if you explain why waiting is safe (e.g. TCA far away and fresh data expected before the burn time).
- routine (>= 5 km): monitoring is usually enough; a data request is useful when element sets are old and the TCA is far away.
Rules:
- Use only the numbers given. Never invent values, probabilities or new manoeuvres.
- Public orbital elements carry no covariance: never claim a probability of collision. You may say the distance is within the expected position error, but that argues for protecting, not for waiting.
- A data request alone does not change the trajectory.
- Debris and rocket bodies cannot manoeuvre.
- Actions are simulated; a human may approve or reject them.`;

const RESPONSE_SCHEMA = (ids: string[]) => ({
  type: 'object',
  additionalProperties: false,
  required: ['option_id', 'urgency', 'rationale', 'caveats'],
  properties: {
    option_id: { type: 'string', enum: ids },
    urgency: { type: 'string', enum: ['routine', 'elevated', 'critical'] },
    rationale: { type: 'string' },
    caveats: { type: 'string' },
  },
});

/** Parses and validates the model reply; throws on anything unexpected. */
export function parseModelReply(json: unknown, options: AgentOption[]): Omit<AgentRecommendation, 'decidedBy'> {
  const body = json as { choices?: { message?: { content?: string | null; refusal?: string | null } }[]; error?: { message?: string } };
  if (body?.error) throw new Error(`OpenAI: ${body.error.message ?? 'error'}`);
  const msg = body?.choices?.[0]?.message;
  if (!msg) throw new Error('OpenAI reply without message');
  if (msg.refusal) throw new Error(`OpenAI refused: ${msg.refusal}`);
  const parsed = JSON.parse(msg.content ?? '') as Record<string, unknown>;
  const optionId = String(parsed.option_id);
  if (!options.some((o) => o.id === optionId)) throw new Error(`Model chose an unknown option "${optionId}"`);
  const urgency = String(parsed.urgency) as Urgency;
  if (!['routine', 'elevated', 'critical'].includes(urgency)) throw new Error('Invalid urgency');
  return { optionId, urgency, rationale: String(parsed.rationale ?? '').slice(0, 1200), caveats: String(parsed.caveats ?? '').slice(0, 800) };
}

export class DecisionAgent {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(apiKey: string, fetchImpl: typeof fetch = fetch) {
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
  }

  get configured(): boolean {
    return this.apiKey !== '';
  }

  async recommend(ctx: AgentEventContext, options: AgentOption[]): Promise<AgentRecommendation> {
    if (!this.configured) return ruleBasedChoice(ctx, options, 'OPENAI_API_KEY is not set on the server');
    const facts = {
      event: {
        pair: `${ctx.primary.name} (${ctx.primary.category}) × ${ctx.secondary.name} (${ctx.secondary.category})`,
        tca_utc: new Date(ctx.tcaMs).toISOString(),
        hours_until_tca: Number(((ctx.tcaMs - ctx.nowMs) / 3_600_000).toFixed(2)),
        minimum_computed_distance_km: Number(ctx.minDistanceKm.toFixed(3)),
        relative_speed_km_s: Number(ctx.relSpeedKmS.toFixed(3)),
        screening_threshold_km: ctx.thresholdKm,
        element_set_age_days: { primary: Number(ctx.primary.dataAgeDays.toFixed(2)), secondary: Number(ctx.secondary.dataAgeDays.toFixed(2)) },
        primary_altitude_km: ctx.primary.altitudeKm,
        simulated_test_scenario: ctx.simulated,
        tier: tierOf(ctx),
      },
      expected_position_error_note: 'SGP4 with public elements: about 1 km at epoch, growing by roughly 1–3 km per day in low orbit.',
      options,
    };
    try {
      const res = await this.fetchImpl(OPENAI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: AGENT.model,
          temperature: 0.2,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: JSON.stringify(facts) },
          ],
          response_format: { type: 'json_schema', json_schema: { name: 'close_approach_decision', strict: true, schema: RESPONSE_SCHEMA(options.map((o) => o.id)) } },
        }),
        signal: AbortSignal.timeout(45_000),
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const m = (json as { error?: { message?: string } } | null)?.error?.message;
        throw new Error(`OpenAI HTTP ${res.status}${m ? `: ${m}` : ''}`);
      }
      return { ...parseModelReply(json, options), decidedBy: AGENT.model };
    } catch (e) {
      return ruleBasedChoice(ctx, options, (e as Error).message);
    }
  }
}

/** Validates the event context sent by the browser. */
export function parseEventContext(body: unknown): AgentEventContext {
  const b = body as AgentEventContext;
  const num = (v: unknown, name: string) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`Invalid field ${name}`);
    return v;
  };
  const obj = (o: AgentEventContext['primary'], name: string) => {
    if (!o || typeof o !== 'object') throw new Error(`Invalid field ${name}`);
    return {
      noradId: num(o.noradId, `${name}.noradId`),
      name: String(o.name ?? '').slice(0, 80),
      category: String(o.category ?? 'unknown').slice(0, 20),
      altitudeKm: o.altitudeKm === null ? null : num(o.altitudeKm, `${name}.altitudeKm`),
      dataAgeDays: num(o.dataAgeDays, `${name}.dataAgeDays`),
    };
  };
  if (!b || typeof b !== 'object' || typeof b.eventId !== 'string') throw new Error('Invalid event');
  return {
    eventId: b.eventId.slice(0, 120),
    primary: obj(b.primary, 'primary'),
    secondary: obj(b.secondary, 'secondary'),
    tcaMs: num(b.tcaMs, 'tcaMs'),
    minDistanceKm: num(b.minDistanceKm, 'minDistanceKm'),
    relSpeedKmS: num(b.relSpeedKmS, 'relSpeedKmS'),
    thresholdKm: num(b.thresholdKm, 'thresholdKm'),
    nowMs: num(b.nowMs, 'nowMs'),
    simulated: Boolean(b.simulated),
  };
}
