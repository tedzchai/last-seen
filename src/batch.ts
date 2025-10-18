import { listEvents, RawEvent } from './calendar';
import { heuristicFilter, llmFilter } from './filter';
import { normalizePlace } from './geocode';
import { loadCache, writeCache, getCached, setCached } from './cache';
import { CFG } from './config';

const iso = (d: Date) => d.toISOString();

export async function processEvent(cache: any, ev: RawEvent) {
  // fast deny
  const h = heuristicFilter(ev);
  if (!h.pass) { setCached(cache, ev, { action:'HIDE', decidedAt:new Date().toISOString() }); return; }

  // LLM decision
  const llm = await llmFilter(ev);
  if (!llm.show) { setCached(cache, ev, { action:'HIDE', decidedAt:new Date().toISOString() }); return; }

  // Use original location for geocoding (accurate city/state) but LLM normalized name for display
  const originalLocation = ev.location!;
  const displayName = llm.normalized || originalLocation;

  console.log(`📍 Geocoding with: "${originalLocation}"`);
  console.log(`📍 Display name: "${displayName}"`);

  const norm = await normalizePlace(originalLocation);
  setCached(cache, ev, {
    action:'SHOW',
    place: displayName,  // Use LLM's clean name for display
    city:  norm.city,    // Use geocoded city/state
    mapUrl: norm.mapUrl, // Use original location for map URL
    decidedAt: new Date().toISOString()
  });
}

export async function runDailyBatch() {
  const now = new Date();
  const tMin = new Date(now.getTime());
  const tMax = new Date(now.getTime() + CFG.LOOKAHEAD_HOURS * 3600_000);
  const events = await listEvents(iso(tMin), iso(tMax));

  const cache = await loadCache();
  for (const ev of events) {
    if (getCached(cache, ev)) continue;
    await processEvent(cache, ev);
  }
  await writeCache(cache);
  console.log('Daily batch complete.');
}

if (require.main === module) runDailyBatch().catch(e => { console.error(e); process.exit(1); });
