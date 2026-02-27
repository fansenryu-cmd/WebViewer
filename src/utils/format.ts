/**
 * 공용 포맷 유틸리티 (메인앱 src/utils/format.ts 동기화)
 */

/** 조회수 포맷: 1.2억, 14.3만, 3,500 */
export function formatViews(v: number | null | undefined): string {
  if (v === null || v === undefined) return '-';
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억`;
  if (v >= 10_000) return `${(v / 10_000).toFixed(1)}만`;
  return v.toLocaleString();
}

/** 날짜 축약: YYYY-MM-DD → MM.DD */
export function formatDateShort(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  return parts.length >= 3 ? `${parts[1]}.${parts[2]}` : dateStr;
}

/** 한국어 날짜: YYYY년 M월 D일 */
export function formatDateKorean(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** 증감폭 포맷: +14.3만, -5.4만 */
export function formatDelta(v: number): string {
  const sign = v >= 0 ? '+' : '';
  return `${sign}${formatViews(Math.abs(v))}`;
}

/** 퍼센트 포맷 */
export function formatPercent(v: number, decimals = 1): string {
  return `${v.toFixed(decimals)}%`;
}
