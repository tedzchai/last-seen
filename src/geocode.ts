import { CFG } from './config';

export type Geo = {
  place: string;
  city?: string;   // actually city + state combined for display
  mapUrl?: string;
  ok: boolean;
};

export async function normalizePlace(q: string): Promise<Geo> {
  if (!CFG.GOOGLE_MAPS_API_KEY) return { place: q, ok: true };

  // Step 1: search place with geographic bias
  const searchRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": CFG.GOOGLE_MAPS_API_KEY,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress",
    },
    body: JSON.stringify({
      textQuery: q,
      // Bias results toward SF Bay Area (user's location)
      locationBias: {
        circle: {
          center: { latitude: 37.7749, longitude: -122.4194 }, // SF coordinates
          radius: 50000 // 50km radius to cover Bay Area
        }
      }
    }),
  });

  const searchData = await searchRes.json();

  // Debug logging to help trace geocoding issues
  console.log(`🔍 Geocoding query: "${q}"`);
  console.log(`📍 Found ${searchData.places?.length || 0} places`);
  if (searchData.places?.length > 0) {
    console.log(`🥇 Top result: ${searchData.places[0].displayName?.text} - ${searchData.places[0].formattedAddress}`);
  }

  const cand = searchData.places?.[0];
  if (!cand?.id) {
    console.log(`❌ No valid place found for: "${q}"`);
    return { place: q, ok: true };
  }

  // Step 2: get details
  const detailRes = await fetch(
    `https://places.googleapis.com/v1/places/${cand.id}?fields=displayName,formattedAddress,addressComponents,googleMapsUri`,
    { headers: { "X-Goog-Api-Key": CFG.GOOGLE_MAPS_API_KEY } }
  );
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

  // ✅ Merge into one display string
  const cityState = [city, state].filter(Boolean).join(", ");

  const result = {
    place: d.displayName?.text || q,
    city: cityState || undefined,
    mapUrl: d.googleMapsUri,
    ok: true,
  };

  console.log(`✅ Final geocoding result:`, result);
  return result;
}