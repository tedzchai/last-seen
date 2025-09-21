import { Client, PlaceInputType } from '@googlemaps/google-maps-services-js';
import { CFG } from './config';

const maps = new Client({});

export type Geo = {
  place: string;
  city?: string;
  state?: string;
  mapUrl?: string;
  ok: boolean;
};

export async function normalizePlace(q: string): Promise<Geo> {
  if (!CFG.GOOGLE_MAPS_API_KEY) return { place: q, ok: true };

  // Step 1: find candidate
  const found = await maps.findPlaceFromText({
    params: {
      input: q,
      inputtype: PlaceInputType.textQuery,
      fields: ['name','formatted_address','place_id'],
      key: CFG.GOOGLE_MAPS_API_KEY
    }
  });
  const cand = found.data.candidates?.[0];
  if (!cand?.place_id) return { place: q, ok: true };

  // Step 2: get details (with address components)
  const det = await maps.placeDetails({
    params: {
      place_id: cand.place_id,
      fields: ['types','url','name','formatted_address','address_components'],
      key: CFG.GOOGLE_MAPS_API_KEY
    }
  });
  const d = det.data.result;

  let city: string | undefined;
  let state: string | undefined;

  if (d?.address_components) {
    for (const c of d.address_components) {
      // Use string types directly since Google Maps API returns string literals
      const types = c.types as string[];
      if (types.includes('locality')) city = c.long_name;
      if (types.includes('administrative_area_level_1')) state = c.long_name;
    }
  }

  // Fallback: parse formatted_address
  if ((!city || !state) && d?.formatted_address) {
    const parts = d.formatted_address.split(',').map(p => p.trim());
    if (!city && parts.length >= 2) city = parts[parts.length-2];
    if (!state && parts.length >= 1) state = parts[parts.length-1];
  }

  return {
    place: d?.name || q,
    city,
    state,
    mapUrl: d?.url,
    ok: true
  };
}
