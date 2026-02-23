/**
 * Surge 계산 서비스 (backend/routers/management/reports.py 포팅)
 */
import type { Database } from 'sql.js';
import type { SurgeItem, DailyRanking, ManagementNovel, DailyStatistics } from '../db/types';
import { getAllNovels, getStatsByNovelId, getRankingsByDate, getLatestRankingDate } from '../db/queries';
import { normalizePlatform, SURGE_PLATFORMS } from '../utils/platform';

/** 날짜 문자열에서 N일 전 날짜 구하기 */
function daysAgo(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/** 지난달 말일 */
function lastMonthEnd(dateStr: string): string {
  const d = new Date(dateStr);
  d.setDate(0); // 이전달 마지막 날
  return d.toISOString().slice(0, 10);
}

/** 가장 가까운 날짜의 통계 찾기 */
function findClosestStat(
  stats: DailyStatistics[],
  targetDate: string,
  rangeDays = 7,
): DailyStatistics | null {
  const target = new Date(targetDate).getTime();
  let closest: DailyStatistics | null = null;
  let minDiff = Infinity;
  for (const s of stats) {
    const diff = Math.abs(new Date(s.date).getTime() - target);
    if (diff < minDiff && diff <= rangeDays * 86400000) {
      minDiff = diff;
      closest = s;
    }
  }
  return closest;
}

/** Surge 리포트 빌드 */
function buildSurgeReport(
  novels: ManagementNovel[],
  allStatsMap: Map<number, DailyStatistics[]>,
  baseDate: string,
): { daily: SurgeItem[]; weekly: SurgeItem[]; monthly: SurgeItem[] } {
  const daily: SurgeItem[] = [];
  const weekly: SurgeItem[] = [];
  const monthly: SurgeItem[] = [];

  const prevDate = daysAgo(baseDate, 1);
  const weekDate = daysAgo(baseDate, 7);
  const monthEnd = lastMonthEnd(baseDate);

  for (const novel of novels) {
    const platform = normalizePlatform(novel.platform);
    if (!SURGE_PLATFORMS.includes(platform)) continue;

    const stats = allStatsMap.get(novel.id) || [];
    if (stats.length === 0) continue;

    const latest = stats[stats.length - 1];

    // Daily surge
    const prev = findClosestStat(stats, prevDate, 3);
    if (prev && prev.date !== latest.date) {
      const surge = latest.views - prev.views;
      const rate = prev.views > 0 ? (surge / prev.views) * 100 : 0;
      daily.push({
        novel_id: novel.id,
        title: novel.title,
        platform,
        views: latest.views,
        surge,
        surge_rate: Math.round(rate * 10) / 10,
        author: novel.author,
      });
    }

    // Weekly surge
    const weekStat = findClosestStat(stats, weekDate, 10);
    if (weekStat && weekStat.date !== latest.date) {
      const surge = latest.views - weekStat.views;
      const rate = weekStat.views > 0 ? (surge / weekStat.views) * 100 : 0;
      weekly.push({
        novel_id: novel.id,
        title: novel.title,
        platform,
        views: latest.views,
        surge,
        surge_rate: Math.round(rate * 10) / 10,
        author: novel.author,
      });
    }

    // Monthly surge
    const monthStat = findClosestStat(stats, monthEnd, 7);
    if (monthStat && monthStat.date !== latest.date) {
      const surge = latest.views - monthStat.views;
      const rate = monthStat.views > 0 ? (surge / monthStat.views) * 100 : 0;
      monthly.push({
        novel_id: novel.id,
        title: novel.title,
        platform,
        views: latest.views,
        surge,
        surge_rate: Math.round(rate * 10) / 10,
        author: novel.author,
      });
    }
  }

  // 절대값 기준 내림차순 정렬
  daily.sort((a, b) => b.surge - a.surge);
  weekly.sort((a, b) => b.surge - a.surge);
  monthly.sort((a, b) => b.surge - a.surge);

  return { daily, weekly, monthly };
}

export interface TodayReport {
  date: string;
  rankings: Record<string, DailyRanking[]>;
  surge: { daily: SurgeItem[]; weekly: SurgeItem[]; monthly: SurgeItem[] };
  myNovelIds: number[];
}

/** 투데이 리포트 생성 */
export function getTodayReport(db: Database): TodayReport | null {
  const latestDate = getLatestRankingDate(db);
  if (!latestDate) return null;

  const rankings = getRankingsByDate(db, latestDate);
  const byPlatform: Record<string, DailyRanking[]> = {};
  for (const r of rankings) {
    const p = normalizePlatform(r.platform);
    if (!byPlatform[p]) byPlatform[p] = [];
    byPlatform[p].push(r);
  }

  const novels = getAllNovels(db);
  const myNovelIds = novels.map((n) => n.id);

  // 전체 통계 로드
  const allStatsMap = new Map<number, DailyStatistics[]>();
  for (const novel of novels) {
    const stats = getStatsByNovelId(db, novel.id);
    allStatsMap.set(novel.id, stats);
  }

  const surge = buildSurgeReport(novels, allStatsMap, latestDate);

  return { date: latestDate, rankings: byPlatform, surge, myNovelIds };
}

/** 특정 날짜 리포트 생성 */
export function getReportByDate(db: Database, date: string): TodayReport {
  const rankings = getRankingsByDate(db, date);
  const byPlatform: Record<string, DailyRanking[]> = {};
  for (const r of rankings) {
    const p = normalizePlatform(r.platform);
    if (!byPlatform[p]) byPlatform[p] = [];
    byPlatform[p].push(r);
  }

  const novels = getAllNovels(db);
  const myNovelIds = novels.map((n) => n.id);

  const allStatsMap = new Map<number, DailyStatistics[]>();
  for (const novel of novels) {
    allStatsMap.set(novel.id, getStatsByNovelId(db, novel.id));
  }

  const surge = buildSurgeReport(novels, allStatsMap, date);

  return { date, rankings: byPlatform, surge, myNovelIds };
}
