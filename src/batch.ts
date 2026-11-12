import { listEvents, RawEvent } from './calendar';
import { heuristicFilter, llmFilter, looksLikeStreetAddress, looksLikeUrl, looksLikeSensitiveLocation } from './filter';
import { normalizePlace, extractVenueName } from './geocode';
import { loadCache, writeCache, getCached, setCached } from './cache';
import { CFG } from './config';

const iso = (d: Date) => d.toISOString();

export async function processEvent(cache: any, ev: RawEvent) {
  // fast deny
  const h = heuristicFilter(ev);
  if (!h.pass) { setCached(cache, ev, { action:'HIDE', decidedAt:new Date().toISOString() }); return; }

  // LLM decision. FAIL CLOSED: a location is only ever published when the LLM
  // affirmatively classifies it SHOW. If the LLM can't be reached (quota/outage/
  // error) we HIDE rather than fall back to heuristic-only, because the heuristic
  // can't recognize every sensitive place by name — publishing a private location
  // during an outage is the exact failure we must never allow. (Before this, a 429
  // left llmShow=true and any named venue leaked, medical ones included.)
  let llmShow: boolean;
  let llmNormalized: string | undefined;
  try {
    const llm = await llmFilter(ev);
    llmShow = llm.show;
    llmNormalized = llm.normalized;
  } catch (e: any) {
    console.warn(`LLM classification unavailable for "${ev.summary}" (${e?.status ?? 'error'}); hiding (fail-closed).`);
    setCached(cache, ev, { action:'HIDE', decidedAt:new Date().toISOString() });
    throw e; // let the run decide whether to stop early (e.g. on a 429 quota error)
  }
  if (!llmShow) { setCached(cache, ev, { action:'HIDE', decidedAt:new Date().toISOString() }); return; }

  // Use original location for geocoding (accurate city/state) but LLM normalized name for display
  const originalLocation = ev.location!;
  const displayName = llmNormalized || extractVenueName(originalLocation);

  // Safety net: never publish a raw street address, an online-event link, or a
  // sensitive private destination as the "place". If the best display name (or the
  // original location) still looks like any of those — e.g. the LLM wrongly SHOWed
  // a medical place — treat it as private and HIDE.
  if (looksLikeStreetAddress(displayName) || looksLikeUrl(displayName) ||
      looksLikeSensitiveLocation(displayName) || looksLikeSensitiveLocation(originalLocation)) {
    const why = looksLikeUrl(displayName) ? 'a URL / online-event link'
      : (looksLikeSensitiveLocation(displayName) || looksLikeSensitiveLocation(originalLocation)) ? 'a sensitive/private location'
      : 'a bare address';
    console.log(`🔒 Display name "${displayName}" looks like ${why} — hiding.`);
    setCached(cache, ev, { action:'HIDE', decidedAt:new Date().toISOString() });
    return;
  }

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
  console.log(`Batch window: ${iso(tMin)} → ${iso(tMax)} (${events.length} events)`);
  for (const ev of events) {
    const cached = getCached(cache, ev);
    console.log(`  [${cached ? cached.action : 'NEW'}] ${ev.summary || '(no title)'} | loc: ${ev.location ? `"${ev.location.slice(0, 60)}"` : 'MISSING'} | ends: ${ev.end?.dateTime || ev.end?.date}`);
    if (cached) continue;
    try {
      await processEvent(cache, ev);
    } catch (e: any) {
      if (e?.status === 429) {
        console.warn('OpenAI quota exceeded — stopping batch early. Add credits at platform.openai.com.');
        break;
      }
      throw e;
    }
  }
  await writeCache(cache);
  console.log('Daily batch complete.');
}

if (require.main === module) runDailyBatch().catch(e => { console.error(e); process.exit(1); });
