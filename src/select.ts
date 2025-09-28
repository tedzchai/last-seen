import type { RawEvent } from './calendar';
import { getCached } from './cache';

export function eventInstant(ev: RawEvent): Date | null {
  const iso = ev.end?.dateTime || ev.start?.dateTime || ev.end?.date || ev.start?.date;
  if (!iso) return null;
  return iso.length === 10 ? new Date(iso + 'T23:59:00') : new Date(iso);
}

/**
 * Pick the most recent past event within lookback window
 * that is also marked SHOW in the cache.
 */
export function pickLatestCompleted(
  events: RawEvent[],
  now = new Date(),
  lookbackHours = 12,
  cache: any
): RawEvent | null {
  const cutoff = now.getTime() - lookbackHours * 3600_000;

  const scored = events
    .map(ev => ({ ev, when: eventInstant(ev) }))
    .filter(x => x.when && x.when!.getTime() <= now.getTime() && x.when!.getTime() >= cutoff)
    .sort((a, b) => b.when!.getTime() - a.when!.getTime()); // newest first

  for (const { ev } of scored) {
    const c = getCached(cache, ev);
    if (c?.action === 'SHOW') {
      return ev;
    }
  }

  return null;
}
