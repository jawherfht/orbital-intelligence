/** Display formatting. All times are shown in UTC (SPEC §6.3). */

export function fmtUtc(ms: number, withSeconds = true): string {
  const iso = new Date(ms).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, withSeconds ? 19 : 16)} UTC`;
}

export function fmtUtcTime(ms: number): string {
  return `${new Date(ms).toISOString().slice(11, 19)} UTC`;
}

export function fmtNum(v: number, digits = 1): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtKm(v: number, digits = 1): string {
  return `${fmtNum(v, digits)} km`;
}

export function fmtLat(deg: number): string {
  return `${Math.abs(deg).toFixed(2)}°${deg >= 0 ? 'N' : 'S'}`;
}

export function fmtLon(deg: number): string {
  return `${Math.abs(deg).toFixed(2)}°${deg >= 0 ? 'E' : 'W'}`;
}

/** "+2h 15m", "−45m", "in 3h 02m" style relative offsets. */
export function fmtOffset(ms: number): string {
  const sign = ms < 0 ? '−' : '+';
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3600_000);
  const m = Math.floor((abs % 3600_000) / 60_000);
  if (h === 0) return `${sign}${m}m`;
  return `${sign}${h}h ${String(m).padStart(2, '0')}m`;
}

export function fmtDays(days: number): string {
  return Math.abs(days) < 10 ? days.toFixed(1) : days.toFixed(0);
}
