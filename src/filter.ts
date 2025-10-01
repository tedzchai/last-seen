import OpenAI from 'openai';
import { z } from 'zod';
import type { RawEvent } from './calendar';
import { CFG } from './config';

const denyKeywords = [
  'home','apartment','condo','residence','unit #','suite #','apt #'
];

const isVirtual = (s: string) => {
  // Only reject if it's PURELY virtual (no physical address)
  const hasZoom = /(zoom|teams|meet\.google|zoom\.us)/i.test(s);
  const hasPhysicalAddress = /\d+\s+.+\b(St|Ave|Blvd|Rd|Road|Street|Avenue|Boulevard|Lane|Ln|Dr|Drive)\b/i.test(s);
  return hasZoom && !hasPhysicalAddress;
};

export function heuristicFilter(ev: RawEvent): { pass: boolean; why?: string } {
  const blob = [ev.summary, ev.description, ev.location].filter(Boolean).join(' ').toLowerCase();
  if (ev.status === 'cancelled') return { pass:false, why:'cancelled' };
  if (!ev.location) return { pass:false, why:'no-location' };
  if (isVirtual(ev.location)) return { pass:false, why:'virtual' };

  // Only block obvious residential keywords
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
- SHOW if the location is a public place or business such as a cafe, bakery, restaurant, bookstore, shop, gym, park, trail, beach, venue, coworking space, library, travel hub (airport, train station), museum, gallery, or other clearly public establishment.
- HIDE only if it clearly refers to a private residence, home address, apartment/condo, workplace/office (including company HQs), medical/therapy/healthcare provider, hospital, law office, courthouse, or other sensitive/personal service location.
- When uncertain, default to SHOW rather than HIDE.
- Normalize the name to a concise version (e.g., "Blackbird Cafe" instead of "Blackbird Cafe and Roastery LLC"). Remove extra legal suffixes (LLC, Inc.) and unnecessary words. Add/remove "The" if it makes the name more natural.

Output STRICT JSON: {"action":"SHOW|HIDE","normalized_place":"...","reason":"..."}.
`;

  const user = `Title: ${ev.summary ?? ''}
Location: ${ev.location ?? ''}
Description: ${ev.description ?? ''}`;

console.log("---- LLM INPUT ----");
console.log(user);

  const r = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    messages: [{ role:'system', content: sys }, { role:'user', content: user }],
    response_format: { type: 'json_object' }
  });

  console.log("---- LLM OUTPUT ----");
  console.log(r.choices[0].message.content);
  
  const json = JSON.parse(r.choices[0].message.content!);
  const parsed = Out.safeParse(json);
  if (!parsed.success) return { show:false, why:'parse-fail' };
  return {
    show: parsed.data.action === 'SHOW',
    normalized: parsed.data.normalized_place,
    why: parsed.data.reason
  };
}
