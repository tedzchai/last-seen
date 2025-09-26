import { CFG } from './config';

export type Geo = {
  place: string;
  city?: string;
  state?: string;
  mapUrl?: string;
  ok: boolean;
};

export async function normalizePlace(q: string): Promise<Geo> {
  if (!CFG.GOOGLE_MAPS_API_KEY) return { place: q, ok: true };

  // Step 1: search place
  const searchRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": CFG.GOOGLE_MAPS_API_KEY,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress",
    },
    body: JSON.stringify({ textQuery: q }),
  });

  const searchData = await searchRes.json();
  const cand = searchData.places?.[0];
  if (!cand?.id) return { place: q, ok: true };

  // Step 2: get details
  const detailRes = await fetch(`https://places.googleapis.com/v1/places/${cand.id}?fields=displayName,formattedAddress,addressComponents,googleMapsUri`, {
    headers: {
      "X-Goog-Api-Key": CFG.GOOGLE_MAPS_API_KEY,
    },
  });
  const d = await detailRes.json();

  let city: string | undefined;
  let state: string | undefined;

  if (d.addressComponents) {
    for (const c of d.addressComponents) {
      const types = c.types as string[];
      if (types.includes("locality")) city = c.longText;
      if (types.includes("administrative_area_level_1")) state = c.longText;
    }
  }

  // fallback: parse formattedAddress
  if ((!city || !state) && d.formattedAddress) {
    const parts = d.formattedAddress.split(",").map((p: string) => p.trim());
    if (!city && parts.length >= 2) city = parts[parts.length - 2];
    if (!state && parts.length >= 1) state = parts[parts.length - 1];
  }

  return {
    place: d.displayName?.text || q,
    city,
    state,
    mapUrl: d.googleMapsUri,
    ok: true,
  };
}
