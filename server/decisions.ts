/**
 * Decision history (DECISIONS D29): every recommendation with its outcome
 * (pending, approved, rejected, auto-executed), persisted to data/decisions.json
 * so it survives restarts. The file is git-ignored.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AgentEventContext, AgentOption, AgentRecommendation, DecisionRecord, DecisionStatus } from '../src/types/agent.ts';

export class DecisionStore {
  private records: DecisionRecord[] = [];
  private readonly file: string | null;

  /** `file` = null keeps the history in memory only (tests). */
  constructor(file: string | null) {
    this.file = file;
    if (file && existsSync(file)) {
      try {
        const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
        if (Array.isArray(parsed)) this.records = parsed as DecisionRecord[];
      } catch {
        // Corrupt file: keep it aside and start a new history.
        renameSync(file, `${file}.corrupt-${Date.now()}`);
      }
    }
  }

  private save() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.records, null, 2));
    renameSync(tmp, this.file);
  }

  list(): DecisionRecord[] {
    return [...this.records].sort((a, b) => b.createdAt - a.createdAt);
  }

  /** Pending or auto-executed decision already made for this event (avoids paying the LLM twice). */
  findOpenForEvent(eventId: string): DecisionRecord | undefined {
    return this.records.find((r) => r.event.eventId === eventId && (r.status === 'pending' || r.status === 'auto-executed'));
  }

  create(event: AgentEventContext, options: AgentOption[], recommendation: AgentRecommendation, status: DecisionStatus, policy: string, now = Date.now()): DecisionRecord {
    const rec: DecisionRecord = {
      id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: now,
      event,
      options,
      recommendation,
      status,
      policy,
      ...(status === 'auto-executed' ? { resolvedAt: now, resolvedBy: 'auto-policy' as const } : {}),
    };
    this.records.push(rec);
    this.save();
    return rec;
  }

  /** Approve or reject a pending decision. */
  resolve(id: string, outcome: 'approved' | 'rejected', comment = '', now = Date.now()): DecisionRecord {
    const rec = this.records.find((r) => r.id === id);
    if (!rec) throw new Error('Decision not found');
    if (rec.status !== 'pending') throw new Error(`Decision already ${rec.status}`);
    rec.status = outcome;
    rec.resolvedAt = now;
    rec.resolvedBy = 'operator';
    if (comment) rec.comment = comment.slice(0, 500);
    this.save();
    return rec;
  }
}
