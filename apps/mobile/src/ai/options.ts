export const activityOptions = [['NATURE', 'Thiên nhiên'], ['CULTURE', 'Văn hóa'], ['ENTERTAINMENT', 'Giải trí'], ['FOOD_CAFES', 'Ẩm thực & cafe']];
export const styleOptions = [['ADVENTURE', 'Khám phá'], ['RELAXATION', 'Thư giãn'], ['NATURE', 'Cảnh quan'], ['PHOTOGRAPHY', 'Nhiếp ảnh'], ['CULTURE', 'Văn hóa'], ['FOOD_CAFES', 'Cafe'], ['FAMILY', 'Đi cùng gia đình']];
export const environmentOptions = [['ANY', 'Linh hoạt'], ['INDOOR', 'Trong nhà'], ['OUTDOOR', 'Ngoài trời']];
export const minuteLabel = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
