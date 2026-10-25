/**
 * Browser client of the decision agent endpoints (server/agent.ts, DECISIONS D29).
 */
import type { AgentEventContext, DecisionRecord } from '../types/agent';
import { API_BASE, SourceError } from './sourcesClient';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(60_000) });
  } catch {
    throw new SourceError('Local data server unreachable — start it with "npm run dev".', 'server-down');
  }
  if (!(res.headers.get('content-type') ?? '').includes('application/json')) throw new SourceError('Local data server unreachable — start it with "npm run dev".', 'server-down');
  const body = (await res.json()) as T & { error?: string; code?: string };
  if (!res.ok) throw new SourceError(body.error ?? `HTTP ${res.status}`, body.code ?? 'upstream');
  return body;
}

export const requestDecision = (ctx: AgentEventContext) =>
  call<{ decision: DecisionRecord; reused: boolean }>('/agent/decide', { method: 'POST', body: JSON.stringify(ctx) });

export const fetchDecisions = () => call<{ decisions: DecisionRecord[] }>('/decisions');

export const resolveDecision = (id: string, outcome: 'approve' | 'reject', comment: string) =>
  call<{ decision: DecisionRecord }>(`/decisions/${encodeURIComponent(id)}/${outcome}`, { method: 'POST', body: JSON.stringify({ comment }) });
