import React from 'react';
import type { Place, WeatherSummary } from '../types';
import { C, Card, date, hour, Pill, Txt } from '../ui';
import { suitability } from './model';
export function WeatherInsight({ place, weather }: { place: Place; weather?: WeatherSummary | null }) {
  const assessment = suitability(place, weather);
  const temperatures = weather?.slots.map(s => s.temperatureC).filter((v): v is number => v != null) || [];
  const winds = weather?.slots.map(s => s.windKmh).filter((v): v is number => v != null) || [];
  return <Card style={{ gap: 5, padding: 14, backgroundColor: C.bg }}>
    <Pill tone={assessment.status === 'suitable' ? 'green' : assessment.status === 'risk' ? 'amber' : 'muted'}>{assessment.label}</Pill>
    {weather?.demo && <Pill tone="amber">DEMO · thời tiết giả lập</Pill>}
    <Txt size={11}>{assessment.explanation}</Txt>
    {(temperatures.length > 0 || winds.length > 0) && <Txt size={11} color={C.muted}>{temperatures.length ? `${Math.min(...temperatures).toFixed(1)}–${Math.max(...temperatures).toFixed(1)}°C` : 'Nhiệt độ chưa có dữ liệu'} · {winds.length ? `Gió cao nhất theo giờ: ${Math.max(...winds).toFixed(1)} km/h` : 'Gió chưa có dữ liệu'}</Txt>}
    {weather && <Txt size={10} color={C.muted}>Dự báo tâm thành phố · cập nhật {hour(weather.fetchedAt)} {date(weather.fetchedAt)}. {weather.confidenceText}</Txt>}
  </Card>;
}
