import { dalatCatalog } from './dalat-catalog.js';
const geoById = new Map<string, (typeof dalatCatalog)[number]>(dalatCatalog.map(p => [p.id, p]));
export function placeView(p: any) {
  const geo = geoById.get(p.id);
  const matched = geo && p.city_id === geo.cityId && Math.abs(p.latitude - geo.latitude) < 1e-7 && Math.abs(p.longitude - geo.longitude) < 1e-7;
  return {
    id: p.id, cityId: p.city_id, name: p.name, category: p.category, environment: p.environment,
    latitude: p.latitude, longitude: p.longitude, priceVnd: p.price_vnd, durationMin: p.duration_min,
    openHour: p.open_hour, closeHour: p.close_hour, imageUrl: p.image_url, description: p.description, dataQuality: p.data_quality,
    geographyVerified: !!matched, sourceUrl: matched ? geo.sourceUrl : undefined,
    coordinateKind: matched ? geo.coordinateKind : undefined, sourceTimestamp: matched ? geo.sourceTimestamp : undefined,
    visitorInfo: matched ? geo.visitorInfo : { entranceFeeVnd: null, openingHours: null, visitDurationMin: null, environmentEstimated: true, verifiedAt: null },
    planningAssumptions: { priceVnd: p.price_vnd, durationMin: p.duration_min, openHour: p.open_hour, closeHour: p.close_hour, verified: false },
  };
}
