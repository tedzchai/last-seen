import OpenAI from 'openai';
import { z } from 'zod';
import type { RawEvent } from './calendar';
import { CFG } from './config';

const denyKeywords = [
  'home','apartment','condo','residence','unit #','suite #','apt #'
];

// A display string that is itself a street address (number + street name/suffix)
// or that simply starts with a street number is NOT a publishable venue name.
// The feature is "Last seen at <venue>", so a raw address must never be shown.
const STREET_ADDRESS_RE = /\d+\s+.+\b(St|Ave|Blvd|Rd|Road|Street|Avenue|Boulevard|Lane|Ln|Dr|Drive|Way|Ct|Court|Pl|Place|Ter|Terrace|Hwy|Highway|Cir|Circle)\b/i;
export const looksLikeStreetAddress = (s: string | undefined | null): boolean => {
  if (!s) return false;
  const t = s.trim();
  return /^\d/.test(t) || STREET_ADDRESS_RE.test(t);
};

// A location that is a hyperlink, or names a virtual meeting / online-event
// platform (Zoom, Google Meet, Luma, Eventbrite, …), is an ONLINE event — not a
// physical place. "Last seen at https://luma.com/…" is never correct.
const URL_RE = /(https?:\/\/|www\.)\S+/i;
// Scheme-less link, e.g. "lu.ma/abc123": a dotted host immediately followed by a
// "/path". Requiring the slash-path keeps real venue names ("St. Mary's", "Joe's
// Bar, CA") from matching.
const BARE_HOST_PATH_RE = /\b[a-z0-9-]+(\.[a-z0-9-]+)+\/\S+/i;
const VIRTUAL_PLATFORM_RE = /(zoom\.us|zoom|microsoft teams|teams\.microsoft|teams|meet\.google|google meet|webex|hopin|lu\.ma|luma\.com|eventbrite|gather\.town|whereby|skype|hangouts)/i;
const HAS_PHYSICAL_ADDRESS_RE = /\d+\s+.+\b(St|Ave|Blvd|Rd|Road|Street|Avenue|Boulevard|Lane|Ln|Dr|Drive)\b/i;

// True when the display string is essentially a URL. Such a value is a link to
// an online event, never a physical venue, so it must never be published.
export const looksLikeUrl = (s: string | undefined | null): boolean => {
  if (!s) return false;
  const t = s.trim();
  return URL_RE.test(t) || BARE_HOST_PATH_RE.test(t);
};

const isVirtual = (s: string) => {
  // Reject only if PURELY virtual: a hyperlink or a known online-event platform,
  // with no physical street address also present in the string.
  const virtual = looksLikeUrl(s) || VIRTUAL_PLATFORM_RE.test(s);
  return virtual && !HAS_PHYSICAL_ADDRESS_RE.test(s);
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

  const sys = `You decide if a calendar event's location is safe to display publicly on a personal website as "Last seen at X". This broadcasts the owner's real-time physical location to the public, so privacy is the priority: when in doubt, HIDE.

SHOW only when the location clearly names a public establishment that anyone could walk into — e.g. a cafe, bakery, restaurant, bar, bookstore, shop, gym, park, trail, beach, music/event venue, coworking space, library, travel hub (airport, train station), museum, or gallery. To SHOW, you must be able to extract a recognizable business or venue NAME, not just an address.

HIDE if any of the following apply:
- It refers to a private residence, home, apartment, or condo.
- It is a workplace/office (including company HQs), or a medical, therapy, healthcare, dental, hospital, legal, courthouse, or other sensitive/personal service location.
- It is ONLY a street address, intersection, or coordinates with no recognizable public business or venue name attached (e.g. "3725 Jasmine Ave, Los Angeles, CA 90034"). A bare address is NOT safe to show even if you cannot tell what is there — most bare addresses are homes.
- You are uncertain whether it is a public place. Default to HIDE.

Naming: when you SHOW, extract a clean, concise business/venue name for display (e.g., "K1 Speed" from "K1 Speed - Indoor Go Karts, Corporate Event Venue, ..., 160 Beacon St..."). Strip descriptive text, legal suffixes (LLC, Inc.), marketing copy, and the street address. If the only name you can produce is the street address itself, that means there is no public venue name — set action to HIDE.

Event titles like "Dinner", "Lunch", "Drinks", etc. are only weak hints: SHOW based on the LOCATION naming a real public venue, never on the title alone. A "Dinner" at a bare residential address is still HIDE.

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
