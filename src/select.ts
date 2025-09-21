import type { RawEvent } from './calendar';

export function eventInstant(ev: RawEvent): Date | null {
  const iso = ev.end?.dateTime || ev.start?.dateTime || ev.end?.date || ev.start?.date;
  if (!iso) return null;
  return iso.length === 10 ? new Date(iso+'T23:59:00') : new Date(iso);
}

export function pickLatestCompleted(events: RawEvent[], now=new Date(), lookbackHours=12): RawEvent | null {
  const cutoff = now.getTime() - lookbackHours*3600_000;
  const scored = events.map(ev => ({ ev, when: eventInstant(ev) }))
    .filter(x => x.when && x.when!.getTime() <= now.getTime() && x.when!.getTime() >= cutoff)
    .sort((a,b) => b.when!.getTime() - a.when!.getTime());
  return scored[0]?.ev ?? null;
}
