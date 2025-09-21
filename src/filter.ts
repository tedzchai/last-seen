import OpenAI from 'openai';
import { z } from 'zod';
import type { RawEvent } from './calendar';
import { CFG } from './config';

const denyKeywords = [
  'doctor','dentist','clinic','hospital','therapy','therapist','optometry','dermatology',
  'attorney','law','court','notary',
  'home','apartment','condo','residence','unit','suite','ste',
  'office','hq','headquarters'
];

const isVirtual = (s: string) => /(zoom|google meet|teams|meet\.google|zoom\.us)/i.test(s);
const looksAddress = (s: string) =>
  /\d{1,6}\s+.+\b(St|Ave|Blvd|Rd|Road|Street|Avenue|Boulevard|Lane|Ln|Dr|Drive)\b/i.test(s);

export function heuristicFilter(ev: RawEvent): { pass: boolean; why?: string } {
  const blob = [ev.summary, ev.description, ev.location].filter(Boolean).join(' ').toLowerCase();
  if (ev.status === 'cancelled') return { pass:false, why:'cancelled' };
  if (!ev.location) return { pass:false, why:'no-location' };
  if (isVirtual(ev.location)) return { pass:false, why:'virtual' };
  if (looksAddress(ev.location)) return { pass:false, why:'raw-address' };
  if (denyKeywords.some(k => blob.includes(k))) return { pass:false, why:'denylist' };
  return { pass:true };
}

const Out = z.object({
  action: z.enum(['SHOW','HIDE']),
  normalized_place: z.string().optional(),
  reason: z.string().optional()
});

export async function llmFilter(ev: RawEvent): Promise<{show:boolean; normalized?:string; why?:string}> {
  const client = new OpenAI({ apiKey: CFG.OPENAI_API_KEY });

  const sys = `You decide if a calendar event's location is safe to display publicly on a personal website as "Last seen at X".
Rules:
- HIDE if it refers to: home addresses, private residences, offices, hospitals, lawyers, or other sensitive services.
- SHOW for almost everything else: cafes, bookstores, shops, gyms, parks, restaurants, venues, travel hubs, museums, etc.
- Normalize the name to a concise version (e.g., "Blackbird Cafe" instead of "Blackbird Cafe and Roastery LLC"), and add/remove words like "The" as appropriate.
Output STRICT JSON: {"action":"SHOW|HIDE","normalized_place":"...","reason":"..."}.
`;

  const user = `Title: ${ev.summary ?? ''}
Location: ${ev.location ?? ''}
Description: ${ev.description ?? ''}`;

  const r = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    messages: [{ role:'system', content: sys }, { role:'user', content: user }],
    response_format: { type: 'json_object' }
  });

  const json = JSON.parse(r.choices[0].message.content!);
  const parsed = Out.safeParse(json);
  if (!parsed.success) return { show:false, why:'parse-fail' };
  return {
    show: parsed.data.action === 'SHOW',
    normalized: parsed.data.normalized_place,
    why: parsed.data.reason
  };
}
