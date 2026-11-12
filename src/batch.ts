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

  // LLM decision. On an OpenAI QUOTA error (429) we degrade to heuristic-only,
  // which now includes the deterministic sensitive-location denylist (optometry,
  // medical, dental, therapy, pharmacy, vet, …) AND the publish-boundary address/
  // URL/sensitive nets below. That keeps the feed working during an OpenAI outage
  // without the old hole: before, a 429 fell back to heuristic-only with NO medical
  // blocking at all, which is how "Eye Carumba Optometry" leaked. Any OTHER error
  // fails CLOSED (HIDE) — we never publish a location we couldn't classify at all.
  let llmShow = true;
  let llmNormalized: string | undefined;
  try {
    const llm = await llmFilter(ev);
    llmShow = llm.show;
    llmNormalized = llm.normalized;
  } catch (e: any) {
    if (e?.status === 429) {
      console.warn(`LLM quota exceeded; degrading to heuristic-only (denylist still enforced) for: ${ev.summary}`);
    } else {
      console.warn(`LLM classification errored for "${ev.summary}" (${e?.status ?? 'error'}); hiding (fail-closed).`);
      setCached(cache, ev, { action:'HIDE', decidedAt:new Date().toISOString() });
      throw e;
    }
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
