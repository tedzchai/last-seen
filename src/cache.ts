import crypto from 'node:crypto';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import type { RawEvent } from './calendar';
import { CFG } from './config';

export type Cached = {
  [eventKey: string]: {
    action: 'SHOW' | 'HIDE';
    place?: string;
    city?: string;
    state?: string;         // ✅ added
    mapUrl?: string;
    decidedAt: string;
  }
};

const s3 = new S3Client({ region: CFG.AWS_S3_REGION });
const KEY = 'normalized-cache.json';

export function eventKey(ev: RawEvent) {
  const t = ev.end?.dateTime || ev.start?.dateTime || ev.start?.date || ev.end?.date || 'na';
  const h = crypto.createHash('sha1').update(ev.location ?? '').digest('hex').slice(0, 8);
  return `${ev.id}|${t}|${h}`;
}

export async function loadCache(): Promise<Cached> {
  try {
    const r = await s3.send(new GetObjectCommand({ Bucket: CFG.AWS_S3_BUCKET, Key: KEY }));
    const buf = await r.Body?.transformToByteArray();
    return buf ? JSON.parse(Buffer.from(buf).toString('utf8')) : {};
  } catch {
    return {};
  }
}

export async function writeCache(cache: Cached) {
  await s3.send(new PutObjectCommand({
    Bucket: CFG.AWS_S3_BUCKET,
    Key: KEY,
    Body: JSON.stringify(cache, null, 2),
    ContentType: 'application/json',
    ACL: 'public-read'
  }));
}

export function getCached(cache: Cached, ev: RawEvent) {
  return cache[eventKey(ev)];
}

export function setCached(cache: Cached, ev: RawEvent, data: Cached[string]) {
  cache[eventKey(ev)] = data;
}
