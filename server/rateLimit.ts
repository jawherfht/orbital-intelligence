/**
 * Sliding-window rate limiter with several windows (e.g. 30/min and 300/h
 * for Space-Track). Requests are refused, never queued, so the UI can say why.
 */
export interface Window {
  limit: number;
  ms: number;
}

export class RateLimiter {
  private stamps: number[] = [];
  private readonly windows: Window[];
  private readonly now: () => number;

  constructor(windows: Window[], now: () => number = Date.now) {
    this.windows = windows;
    this.now = now;
  }

  private prune(t: number) {
    const longest = Math.max(...this.windows.map((w) => w.ms));
    while (this.stamps.length && this.stamps[0]! <= t - longest) this.stamps.shift();
  }

  /** Records a request and returns true if every window still has room. */
  tryAcquire(): boolean {
    const t = this.now();
    this.prune(t);
    for (const w of this.windows) {
      const used = this.stamps.filter((s) => s > t - w.ms).length;
      if (used >= w.limit) return false;
    }
    this.stamps.push(t);
    return true;
  }

  /** Requests counted in the last `ms` milliseconds. */
  used(ms: number): number {
    const t = this.now();
    return this.stamps.filter((s) => s > t - ms).length;
  }
}

/** Tiny TTL cache. */
export class TtlCache<V> {
  private map = new Map<string, { at: number; value: V }>();
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(ttlMs: number, now: () => number = Date.now) {
    this.ttlMs = ttlMs;
    this.now = now;
  }

  get(key: string): { at: number; value: V } | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (this.now() - e.at > this.ttlMs) {
      this.map.delete(key);
      return undefined;
    }
    return e;
  }

  set(key: string, value: V): void {
    this.map.set(key, { at: this.now(), value });
  }
}
