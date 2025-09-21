import { listEvents } from './calendar';
import { loadCache, getCached } from './cache';
import { pickLatestCompleted, eventInstant } from './select';
import { publish } from './publish';
import { CFG } from './config';

const iso = (d: Date) => d.toISOString();

export async function runIncremental() {
  const now = new Date();
  const tMin = new Date(now.getTime() - CFG.LOOKBACK_HOURS * 3600_000);
  const tMax = now;

  const events = await listEvents(iso(tMin), iso(tMax));
  const chosen = pickLatestCompleted(events, now, CFG.LOOKBACK_HOURS);
  if (!chosen) { await publish({ place: 'Somewhere', updated: now.toISOString() }); return; }

  const cache = await loadCache();
  const c = getCached(cache, chosen);
  if (c?.action === 'SHOW' && c.place) {
    await publish({
      place: c.place,
      city:  c.city,
      mapUrl: c.mapUrl,
      updated: now.toISOString(),
      eventTime: eventInstant(chosen)?.toISOString()
    });
    console.log('Published from cache');
    return;
  }

  // Strict hybrid: no LLM here; skip to avoid leaks/cost.
  console.log('Chosen event not in cache; skipping publish (will appear after next daily batch).');
}

if (require.main === module) runIncremental().catch(e => { console.error(e); process.exit(1); });
