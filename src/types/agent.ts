/**
 * Decision agent types, shared by the server (server/agent.ts) and the browser.
 */

/** Computed facts about one potential close approach, sent by the browser. */
export interface AgentEventContext {
  eventId: string;
  primary: { noradId: number; name: string; category: string; altitudeKm: number | null; dataAgeDays: number };
  secondary: { noradId: number; name: string; category: string; altitudeKm: number | null; dataAgeDays: number };
  tcaMs: number;
  minDistanceKm: number;
  relSpeedKmS: number;
  thresholdKm: number;
  /** Simulated "now" when the decision is requested. */
  nowMs: number;
  simulated: boolean;
}

export type AgentActionKind = 'monitor' | 'request_tracking_update' | 'along_track_burn';

/** One action the code computed; the LLM can only pick one of these. */
export interface AgentOption {
  id: string;
  kind: AgentActionKind;
  label: string;
  /** Only for burns. */
  deltaVMs?: number;
  burnTimeMs?: number;
  /** First-order estimate of the miss distance after the action, km. */
  estimatedMissKm?: number;
}

export type Urgency = 'routine' | 'elevated' | 'critical';

export interface AgentRecommendation {
  optionId: string;
  urgency: Urgency;
  rationale: string;
  caveats: string;
  /** "gpt-4o-mini" or "rules" when the LLM was unavailable. */
  decidedBy: string;
  /** Why the rules were used instead of the LLM, if so. */
  fallbackReason?: string;
}

export type DecisionStatus = 'pending' | 'approved' | 'rejected' | 'auto-executed';

export interface DecisionRecord {
  id: string;
  createdAt: number;
  event: AgentEventContext;
  options: AgentOption[];
  recommendation: AgentRecommendation;
  status: DecisionStatus;
  /** Why the policy chose auto-execution or human approval. */
  policy: string;
  resolvedAt?: number;
  resolvedBy?: 'operator' | 'auto-policy';
  comment?: string;
}
