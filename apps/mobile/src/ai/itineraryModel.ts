import type { Place, Plan, WeatherSummary } from '../types';
import { mappable } from '../map/model';
export function itineraryGeometry(plan: Pick<Plan, 'items'>, cityId: string) {
  const places: Place[] = [], labels: Record<string, number> = {}, segments: { latitude: number; longitude: number }[][] = [];
  let current: { latitude: number; longitude: number }[] = [];
  for (const [index, item] of plan.items.entries()) {
    if (item.place.cityId === cityId && mappable(item.place)) {
      places.push(item.place); labels[item.placeId] = index + 1;
      current.push({ latitude: item.place.latitude, longitude: item.place.longitude });
    } else { if (current.length > 1) segments.push(current); current = []; }
  }
  if (current.length > 1) segments.push(current);
  return { places, labels, segments, unmappedCount: plan.items.length - places.length };
}
export function visitWeather(weather: WeatherSummary | null, start: string, end: string): WeatherSummary | null {
  if (!weather) return null;
  return { ...weather, slots: weather.slots.filter(s => Date.parse(s.time) < Date.parse(end) && Date.parse(s.time) + 3600000 > Date.parse(start)) };
}
