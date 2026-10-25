/**
 * Decision agent (DECISIONS D29). No network: OpenAI is stubbed with replies
 * in the documented Chat Completions format.
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DecisionAgent, alongTrackDeltaV, applyPolicy, computeOptions, parseEventContext, ruleBasedChoice } from '../agent';
import { DecisionStore } from '../decisions';
import type { AgentEventContext } from '../../src/types/agent';

const NOW = Date.UTC(2026, 9, 25, 12, 0, 0);

function ctx(over: Partial<AgentEventContext> = {}): AgentEventContext {
  return {
    eventId: 'ev-1',
    primary: { noradId: 25544, name: 'ISS (ZARYA)', category: 'station', altitudeKm: 417, dataAgeDays: 0.9 },
    secondary: { noradId: 49044, name: 'OBJECT B', category: 'debris', altitudeKm: 418, dataAgeDays: 1.2 },
    tcaMs: NOW + 6 * 3_600_000,
    minDistanceKm: 3.2,
    relSpeedKmS: 9.1,
    thresholdKm: 10,
    nowMs: NOW,
    simulated: false,
    ...over,
  };
}

function chatReply(content: object) {
  return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: JSON.stringify(content), refusal: null } }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('computed options', () => {
  it('sizes along-track burns with Δx ≈ 3·Δv·t (burn 2 h before TCA)', () => {
    expect(alongTrackDeltaV(5, 7200)).toBeCloseTo(0.2315, 4); // 5 km / (3 × 7200 s)
    const opts = computeOptions(ctx());
    // 3.2 km = elevated tier; the 2 km target is already exceeded.
    expect(opts.map((o) => o.id)).toEqual(['burn_p_5km', 'monitor']);
    const burn = opts.find((o) => o.id === 'burn_p_5km')!;
    expect(burn.deltaVMs).toBeCloseTo(0.2315, 3);
    expect(burn.burnTimeMs).toBe(NOW + 4 * 3_600_000);
  });

  it('offers no burn for an object that cannot manoeuvre, or when TCA is too close', () => {
    expect(computeOptions(ctx({ primary: { ...ctx().primary, category: 'debris' } })).some((o) => o.kind === 'along_track_burn')).toBe(false);
    expect(computeOptions(ctx({ tcaMs: NOW + 20 * 60_000 })).some((o) => o.kind === 'along_track_burn')).toBe(false);
  });
});

describe('options by distance tier', () => {
  it('critical (< 1 km): burns only, so the agent must act', () => {
    const ids = computeOptions(ctx({ minDistanceKm: 0.58, tcaMs: NOW + 22 * 3_600_000 })).map((o) => o.id);
    expect(ids).toEqual(['burn_p_2km', 'burn_p_5km']);
  });

  it('critical with no manoeuvrable object: only monitoring remains', () => {
    const debris = { ...ctx().primary, category: 'debris' };
    const ids = computeOptions(ctx({ minDistanceKm: 0.5, primary: debris })).map((o) => o.id);
    expect(ids).toEqual(['monitor']);
  });

  it('burns are computed for the secondary when only it can manoeuvre', () => {
    const c = ctx({ primary: { ...ctx().primary, category: 'rocket_body' }, secondary: { ...ctx().secondary, category: 'payload', name: 'SAT-B' } });
    expect(computeOptions(c).map((o) => o.id)).toEqual(['burn_s_5km', 'monitor']);
  });

  it('never offers a tracking-data request (DECISIONS D31)', () => {
    for (const d of [0.4, 3, 7.5]) {
      const ids = computeOptions(ctx({ minDistanceKm: d, tcaMs: NOW + 22 * 3_600_000 })).map((o) => o.id);
      expect(ids).not.toContain('request_update');
    }
    expect(computeOptions(ctx({ minDistanceKm: 7.5 })).map((o) => o.id)).toEqual(['monitor']);
  });
});

describe('policy', () => {
  it('auto-executes below 1 km, otherwise needs a human', () => {
    expect(applyPolicy(ctx({ minDistanceKm: 0.6 })).status).toBe('auto-executed');
    expect(applyPolicy(ctx({ minDistanceKm: 3.2 })).status).toBe('pending');
  });

  it('rule-based fallback picks the largest burn when very close', () => {
    const c = ctx({ minDistanceKm: 0.4 });
    const r = ruleBasedChoice(c, computeOptions(c), 'test');
    expect(r.optionId).toBe('burn_p_5km');
    expect(r.urgency).toBe('critical');
    expect(r.decidedBy).toBe('rules');
  });
});

describe('LLM agent (gpt-4o-mini)', () => {
  it('sends the computed facts with a strict JSON schema restricted to the option ids', async () => {
    let sent: { url: string; body: Record<string, unknown>; auth: string } | null = null;
    const fake = (async (url: string | URL, init?: RequestInit) => {
      sent = { url: String(url), body: JSON.parse(String(init?.body)), auth: (init?.headers as Record<string, string>).Authorization! };
      return chatReply({ option_id: 'burn_p_5km', urgency: 'elevated', rationale: 'Smallest burn reaching 5 km.', caveats: 'No covariance.' });
    }) as typeof fetch;
    const c = ctx();
    const options = computeOptions(c);
    const r = await new DecisionAgent('sk-test', fake).recommend(c, options);
    expect(r).toMatchObject({ optionId: 'burn_p_5km', urgency: 'elevated', decidedBy: 'gpt-4o-mini' });
    expect(sent!.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(sent!.auth).toBe('Bearer sk-test');
    expect(sent!.body.model).toBe('gpt-4o-mini');
    const rf = sent!.body.response_format as { type: string; json_schema: { strict: boolean; schema: { properties: { option_id: { enum: string[] } } } } };
    expect(rf.type).toBe('json_schema');
    expect(rf.json_schema.strict).toBe(true);
    expect(rf.json_schema.schema.properties.option_id.enum).toEqual(options.map((o) => o.id));
  });

  it('rejects an option the code did not compute and falls back to rules', async () => {
    const fake = (async () => chatReply({ option_id: 'burn_50km', urgency: 'critical', rationale: 'x', caveats: 'y' })) as unknown as typeof fetch;
    const r = await new DecisionAgent('sk-test', fake).recommend(ctx(), computeOptions(ctx()));
    expect(r.decidedBy).toBe('rules');
    expect(r.fallbackReason).toMatch(/unknown option/);
  });

  it('falls back to rules on API errors and without a key, saying why', async () => {
    const fake = (async () => new Response(JSON.stringify({ error: { message: 'Incorrect API key provided' } }), { status: 401, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
    const r = await new DecisionAgent('sk-bad', fake).recommend(ctx(), computeOptions(ctx()));
    expect(r.fallbackReason).toMatch(/401.*Incorrect API key/);
    const noKey = await new DecisionAgent('').recommend(ctx(), computeOptions(ctx()));
    expect(noKey.fallbackReason).toMatch(/OPENAI_API_KEY/);
  });

  it('validates the event context from the browser', () => {
    expect(() => parseEventContext({ ...ctx(), minDistanceKm: 'x' })).toThrow(/minDistanceKm/);
    expect(parseEventContext(ctx()).primary.name).toBe('ISS (ZARYA)');
  });
});

describe('decision history', () => {
  it('records approvals, rejections and auto-executions, and persists them', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'oi-')), 'decisions.json');
    const store = new DecisionStore(file);
    const c = ctx();
    const options = computeOptions(c);
    const rec = ruleBasedChoice(c, options, 'test');
    const a = store.create(c, options, rec, 'pending', 'human approval', NOW);
    const b = store.create({ ...c, eventId: 'ev-2' }, options, rec, 'pending', 'human approval', NOW + 1);
    const auto = store.create({ ...c, eventId: 'ev-3', minDistanceKm: 0.5 }, options, rec, 'auto-executed', 'auto', NOW + 2);
    expect(auto.resolvedBy).toBe('auto-policy');
    expect(store.findOpenForEvent('ev-1')?.id).toBe(a.id);

    store.resolve(a.id, 'approved', 'go', NOW + 10);
    store.resolve(b.id, 'rejected', '', NOW + 11);
    expect(() => store.resolve(a.id, 'rejected')).toThrow(/already approved/);

    const reloaded = new DecisionStore(file);
    const byId = Object.fromEntries(reloaded.list().map((d) => [d.id, d]));
    expect(byId[a.id]).toMatchObject({ status: 'approved', resolvedBy: 'operator', comment: 'go' });
    expect(byId[b.id]!.status).toBe('rejected');
    expect(byId[auto.id]!.status).toBe('auto-executed');
    expect(JSON.parse(readFileSync(file, 'utf8'))).toHaveLength(3);
  });
});
