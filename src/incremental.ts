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
  const cache = await loadCache();

  // pass cache into pickLatestCompleted
  const chosen = pickLatestCompleted(events, now, CFG.LOOKBACK_HOURS, cache);

  console.log("Incremental chosen event:", {
    title: chosen?.summary,
    location: chosen?.location,
    start: chosen?.start,
    end: chosen?.end
  });

  if (!chosen) {
    await publish({ place: 'Somewhere', updated: now.toISOString() });
    return;
  }

  const c = getCached(cache, chosen);
  console.log("Cache lookup result:", c);

  if (c?.action === 'SHOW' && c.place) {
    await publish({
      place: c.place,
      city: c.city,
      mapUrl: c.mapUrl,
      updated: now.toISOString(),
      eventTime: eventInstant(chosen)?.toISOString()
    });
    console.log('Published from cache');
    return;
  }

  console.log('Chosen event not in cache or not SHOW; skipping publish.');
}

if (require.main === module) {
  runIncremental().catch(e => {
    console.error(e);
    process.exit(1);
  });
}
