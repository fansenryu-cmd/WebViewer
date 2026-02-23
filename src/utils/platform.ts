/**
 * 플랫폼 정규화 유틸리티
 * backend/routers/management/utils.py + src/utils/platform.ts 통합
 */

export const PLATFORM_ORDER = ['카카오', '네이버', '문피아', '리디', '노벨피아'] as const;
export const SURGE_PLATFORMS = ['네이버시리즈', '카카오페이지', '문피아', '노벨피아'];

const PLATFORM_MAP: Record<string, string> = {
  '문피아': '문피아',
  'munpia': '문피아',
  '문피아닷컴': '문피아',
  '네이버': '네이버',
  'naver': '네이버',
  '네이버시리즈': '네이버',
  '네이버 시리즈': '네이버',
  '카카오': '카카오',
  'kakao': '카카오',
  '카카오페이지': '카카오',
  '카카오 페이지': '카카오',
  '리디': '리디',
  'ridi': '리디',
  '리디북스': '리디',
  '노벨피아': '노벨피아',
  'novelpia': '노벨피아',
};

/** 플랫폼 이름 정규화 (통합 통계용 - 짧은 이름) */
export function normalizePlatform(platform: string | null | undefined): string {
  if (!platform) return '미분류';
  const trimmed = platform.trim();
  return PLATFORM_MAP[trimmed] || PLATFORM_MAP[trimmed.toLowerCase()] || trimmed;
}

/** 플랫폼별 색상 */
export const PLATFORM_COLORS: Record<string, string> = {
  '네이버': '#22c55e',
  '카카오': '#eab308',
  '문피아': '#3b82f6',
  '리디': '#a855f7',
  '노벨피아': '#f97316',
  '미분류': '#9ca3af',
};

/** 플랫폼별 그룹핑 */
export function groupByPlatform<T extends { platform: string }>(
  items: T[],
): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of items) {
    const p = normalizePlatform(item.platform);
    if (!groups[p]) groups[p] = [];
    groups[p].push(item);
  }
  return groups;
}
