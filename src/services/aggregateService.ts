/**
 * 통합 통계 서비스 (backend/routers/management/daily_stats.py 포팅)
 * - _build_novel_series → buildNovelSeries
 * - 5-tier 퍼센타일 중앙값 계산
 */
import type { Database } from 'sql.js';
import type { SeriesPoint, PlatformAggregate, ManagementNovel, DailyStatistics } from '../db/types';
import { getAllNovels, getStatsByNovelId } from '../db/queries';
import { normalizePlatform, PLATFORM_ORDER } from '../utils/platform';

/** 소설 시리즈 빌드 (Python _build_novel_series 포팅) */
export function buildNovelSeries(
  launchDate: string | null,
  stats: DailyStatistics[],
): { totalViews: number; series: SeriesPoint[] } {
  if (stats.length === 0) return { totalViews: 0, series: [] };

  const launch = launchDate ? new Date(launchDate) : new Date(stats[0].date);

  // (daysSinceLaunch, cumulativeViews) 매핑
  const dayMap = new Map<number, number>();
  for (const s of stats) {
    const d = new Date(s.date);
    const days = Math.round((d.getTime() - launch.getTime()) / 86400000);
    const existing = dayMap.get(days) ?? 0;
    dayMap.set(days, Math.max(existing, s.views));
  }

  const minDay = 0;
  const maxDay = Math.max(...dayMap.keys(), 0);
  const totalViews = Math.max(...dayMap.values(), 0);

  // day 0 = Y=0 강제
  const series: SeriesPoint[] = [{ daysSinceLaunch: 0, cumulativeViews: 0 }];

  let prevValue = 0;
  for (let day = 1; day <= maxDay; day++) {
    const val = dayMap.get(day);
    if (val !== undefined) {
      prevValue = Math.max(prevValue, val); // monotonic
    }
    series.push({ daysSinceLaunch: day, cumulativeViews: prevValue });
  }

  return { totalViews, series };
}

/** 중앙값 계산 */
function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 여러 시리즈를 합쳐서 중앙값 시리즈 생성 */
function aggregateSeries(seriesList: SeriesPoint[][]): SeriesPoint[] {
  if (seriesList.length === 0) return [];

  const maxDay = Math.max(...seriesList.map((s) => s.length));
  const result: SeriesPoint[] = [];

  for (let day = 0; day < maxDay; day++) {
    const values: number[] = [];
    for (const s of seriesList) {
      if (day < s.length) {
        values.push(s[day].cumulativeViews);
      }
    }
    if (values.length > 0) {
      result.push({ daysSinceLaunch: day, cumulativeViews: median(values) });
    }
  }

  return result;
}

/** 통합 통계 데이터 생성 */
export function getAggregateStats(
  db: Database,
  myNovelId?: number,
): { byPlatform: Record<string, PlatformAggregate>; platforms: string[] } {
  const novels = getAllNovels(db);
  const byPlatform: Record<string, PlatformAggregate> = {};

  // 플랫폼별 그룹핑
  const platformGroups = new Map<string, { novel: ManagementNovel; totalViews: number; series: SeriesPoint[] }[]>();

  for (const novel of novels) {
    const platform = normalizePlatform(novel.platform);
    const stats = getStatsByNovelId(db, novel.id);
    if (stats.length === 0) continue;

    const { totalViews, series } = buildNovelSeries(novel.launch_date, stats);
    if (totalViews === 0) continue;

    if (!platformGroups.has(platform)) platformGroups.set(platform, []);
    platformGroups.get(platform)!.push({ novel, totalViews, series });
  }

  for (const [platform, items] of platformGroups) {
    // 총 조회수 기준 내림차순 정렬
    items.sort((a, b) => b.totalViews - a.totalViews);
    const n = items.length;

    // 5-tier 분할
    const idx20 = Math.ceil(n * 0.2);
    const idx40 = Math.ceil(n * 0.4);
    const idx60 = Math.ceil(n * 0.6);
    const idx80 = Math.ceil(n * 0.8);

    const top20Series = items.slice(0, idx20).map((i) => i.series);
    const top40Series = items.slice(idx20, idx40).map((i) => i.series);
    const top60Series = items.slice(idx40, idx60).map((i) => i.series);
    const top80Series = items.slice(idx60, idx80).map((i) => i.series);

    const result: PlatformAggregate = {
      top20: aggregateSeries(top20Series),
      top40: aggregateSeries(top40Series),
      top60: aggregateSeries(top60Series),
      top80: aggregateSeries(top80Series),
      totalNovels: n,
    };

    // 내 소설 찾기
    if (myNovelId) {
      const myItem = items.find((i) => i.novel.id === myNovelId);
      if (myItem) {
        result.myNovel = myItem.series;
        const countBetter = items.filter((i) => i.totalViews > myItem.totalViews).length;
        result.percentileTop = Math.round(((countBetter + 1) / n) * 1000) / 10;
      }
    }

    byPlatform[platform] = result;
  }

  // 플랫폼 순서
  const platforms = PLATFORM_ORDER.filter((p) => byPlatform[p]);

  return { byPlatform, platforms };
}
