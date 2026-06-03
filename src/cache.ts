import crypto from 'node:crypto';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import type { RawEvent } from './calendar';
import { CFG } from './config';
import { looksLikeUrl } from './filter';

export type Cached = {
  [eventKey: string]: {
    action: 'SHOW' | 'HIDE';
    place?: string;
    city?: string;
    state?: string;
    mapUrl?: string;
    decidedAt: string;
  };
};

// ✅ S3 client with proper region + credentials fallback
const region = CFG.AWS_S3_REGION || process.env.AWS_S3_REGION || 'us-east-2';
const s3 = new S3Client({
  region,
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  } : undefined,
});

const KEY = 'normalized-cache.json';

export function eventKey(ev: RawEvent) {
  const t =
    ev.end?.dateTime ||
    ev.start?.dateTime ||
    ev.start?.date ||
    ev.end?.date ||
    'na';
  // Location is intentionally excluded from the key: the same event can be
  // seen with or without location data across batch/incremental runs (e.g. if
  // a calendar event is edited after the batch caches it). Including location
  // hash caused SHOW entries to be silently shadowed by a later HIDE entry
  // when location was absent in a subsequent API call.
  return `${ev.id}|${t}`;
}

export async function loadCache(): Promise<Cached> {
  try {
    const r = await s3.send(
      new GetObjectCommand({ Bucket: CFG.AWS_S3_BUCKET, Key: KEY })
    );
    const buf = await r.Body?.transformToByteArray();
    const cache: Cached = buf ? JSON.parse(Buffer.from(buf).toString('utf8')) : {};
    return selfHeal(cache);
  } catch {
    return {};
  }
}

// Drop poisoned SHOW entries whose `place` is a URL (e.g. a Luma / online-event
// link that leaked through before URL filtering existed). Removing them here
// means they get re-decided (and HIDden) on the next pass and a real prior
// location is published instead, rather than the bad value sticking forever.
function selfHeal(cache: Cached): Cached {
  let purged = 0;
  for (const [k, v] of Object.entries(cache)) {
    if (v.action === 'SHOW' && looksLikeUrl(v.place)) {
      delete cache[k];
      purged++;
    }
  }
  if (purged) console.log(`🧹 Purged ${purged} cached SHOW entr${purged === 1 ? 'y' : 'ies'} with a URL place.`);
  return cache;
}

export async function writeCache(cache: Cached) {
  await s3.send(
    new PutObjectCommand({
      Bucket: CFG.AWS_S3_BUCKET,
      Key: KEY,
      Body: JSON.stringify(cache, null, 2),
      ContentType: 'application/json',
    })
  );
}

export function getCached(cache: Cached, ev: RawEvent) {
  return cache[eventKey(ev)];
}

export function setCached(
  cache: Cached,
  ev: RawEvent,
  data: Cached[string]
) {
  cache[eventKey(ev)] = data;
}
