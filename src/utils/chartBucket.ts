/**
 * 통합 통계 / 조회수 상승 그래프용 X축 경과일 버킷 공용
 * - 데스크톱 앱의 chartBucket.ts와 동일 로직 (동기화 유지)
 * - AggregateStatsPage, ComparePage에서 사용
 */

/** X축 경과일 버킷 단위 (일). 인덱스 0=넓음(365일) … 5=촘촘(1일) */
export const BUCKET_DAYS = [365, 200, 100, 30, 7, 1] as const;
export const DEFAULT_BUCKET_INDEX = 3;

/**
 * 런칭일(day 0) 행을 보존하며, 경과일 버킷별로 한 행만 남긴다.
 * 그래프가 (0, 0)에서 시작하도록 day 0은 항상 맨 앞에 삽입.
 */
export function aggregateMergedByBucket<T extends { daysSinceLaunch: number }>(
  rows: T[],
  bucketDays: number
): T[] {
  if (bucketDays <= 0 || rows.length === 0) return rows;
  let day0Row: T | undefined;
  const byBucket = new Map<number, T>();
  for (const row of rows) {
    if (row.daysSinceLaunch === 0) {
      day0Row = { ...row };
      continue;
    }
    const bucket = Math.floor(row.daysSinceLaunch / bucketDays) * bucketDays;
    const existing = byBucket.get(bucket);
    if (!existing || row.daysSinceLaunch > existing.daysSinceLaunch) {
      byBucket.set(bucket, { ...row });
    }
  }
  const result = [...byBucket.values()].sort((a, b) => a.daysSinceLaunch - b.daysSinceLaunch);
  if (day0Row) result.unshift(day0Row);
  return result;
}
