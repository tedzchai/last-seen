import { CFG } from './config';

export type Geo = {
  place: string;
  city?: string;   // actually city + state combined for display
  mapUrl?: string;
  ok: boolean;
};

export async function normalizePlace(q: string): Promise<Geo> {
  if (!CFG.GOOGLE_MAPS_API_KEY) return { place: q, ok: true };

  // If the location already looks like a complete address, use it as-is
  const hasAddress = /\d+\s+.+\b(St|Ave|Blvd|Rd|Road|Street|Avenue|Boulevard|Lane|Ln|Dr|Drive)\b/i.test(q);
  const hasCity = /,\s*[A-Za-z\s]+,?\s*[A-Z]{2}\b/.test(q); // Has city, state pattern

  if (hasAddress && hasCity) {
    console.log(`📍 Using complete address as-is: "${q}"`);
    // Extract business name (everything before the first comma or address)
    const businessName = q.split(/,|\d+\s+/)[0].trim();
    // Extract city and state from address components
    const parts = q.split(',').map(p => p.trim());

    let city = undefined;
    let state = undefined;

    // Look for city and state pattern in the parts
    for (const part of parts) {
      // Match state pattern (2 letter code optionally followed by zip)
      const stateMatch = part.match(/^([A-Z]{2})\b/);
      if (stateMatch && !state) {
        state = stateMatch[1];
        // Look for city in previous parts
        const cityIndex = parts.indexOf(part) - 1;
        if (cityIndex >= 0) {
          city = parts[cityIndex];
        }
        break;
      }
    }

    // Expand state abbreviation to full name for consistency with geocoding API
    const stateNames: {[key: string]: string} = {
      'CA': 'California', 'NY': 'New York', 'TX': 'Texas', 'FL': 'Florida',
      'WA': 'Washington', 'OR': 'Oregon', 'NV': 'Nevada', 'AZ': 'Arizona'
      // Add more as needed
    };
    const fullStateName = state && stateNames[state] ? stateNames[state] : state;

    const cityState = [city, fullStateName].filter(Boolean).join(', ');

    return {
      place: businessName || q,
      city: cityState,
      mapUrl: `https://www.google.com/maps/search/${encodeURIComponent(q)}`,
      ok: true
    };
  }

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
    `https://places.googleapis.com/v1/places/${cand.id}?fields=displayName,formattedAddress,addressComponents,googleMapsUri,location`,
    { headers: { "X-Goog-Api-Key": CFG.GOOGLE_MAPS_API_KEY } }
  );
  const d = await detailRes.json();

  let city: string | undefined;
  let state: string | undefined;

  if (d.addressComponents) {
    for (const c of d.addressComponents) {
      const types = c.types as string[];
      if (types && types.includes("locality")) city = c.longText;
      if (types && types.includes("administrative_area_level_1")) state = c.longText;
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

  // Validate result is in reasonable proximity to SF Bay Area
  const sfLatLng = { lat: 37.7749, lng: -122.4194 };
  if (d.location) {
    const resultLat = d.location.latitude;
    const resultLng = d.location.longitude;

    // Calculate rough distance (not precise, but good enough for validation)
    const latDiff = Math.abs(resultLat - sfLatLng.lat);
    const lngDiff = Math.abs(resultLng - sfLatLng.lng);
    const roughDistance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);

    // If result is very far from SF Bay Area, log a warning
    if (roughDistance > 1.0) { // ~100km rough threshold
      console.log(`⚠️  WARNING: Geocoded location seems far from SF Bay Area:`);
      console.log(`   Query: "${q}"`);
      console.log(`   Result: ${result.place} at ${d.formattedAddress}`);
      console.log(`   Distance indicator: ${roughDistance.toFixed(2)} (>1.0 = far)`);
    }
  }

  console.log(`✅ Final geocoding result:`, result);
  return result;
}