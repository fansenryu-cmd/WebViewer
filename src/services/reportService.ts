/**
 * 리포트 서비스 — today-report, history-report 로직 (reports.py 포팅)
 */
import type { Database } from 'sql.js';
import {
  getAllNovels,
  getLatestStats,
  getRankingsByDateAndPlatform,
  getStatBeforeDate,
  getNovelsByPlatform,
  getLatestRankingDate,
  getRankingsByDate,
  getRankingPlatformsOnDate,
} from '../db/queries';
import type { ManagementNovel, DailyStatistics } from '../db/types';

const SURGE_PLATFORMS = ['네이버시리즈', '카카오페이지', '문피아', '노벨피아'];
// 백엔드 reports.py 및 daily_rankings 테이블의 platform 값과 동일하게 유지
const RANKING_DISPLAY_PLATFORMS = ['네이버시리즈', '카카오페이지', '문피아', '리디', '노벨피아'];
const RANKING_COMPARE_PLATFORMS = ['문피아', '리디', '노벨피아'];

export interface SurgeItem {
  novel_id: number;
  title: string;
  author: string;
  yesterday_views?: number;
  today_views?: number;
  prev_date?: string;
  latest_date?: string;
  last_week_views?: number;
  this_week_views?: number;
  last_month_views?: number;
  this_month_views?: number;
  surge: number;
  surge_rate: number;
  avg_read_through_rate?: number;
}

export interface RankingInfo {
  rank: number;
  title: string;
  author: string;
  publisher?: string;
  views?: number | null;
  genre?: string;
  ranking_type?: string;
  novel_url?: string;
  extra_data?: Record<string, unknown> | null;
}

export interface TodayReportData {
  date: string;
  new_rankings: Record<string, Array<{ id: number; title: string; author: string; platform: string | null; created_at: string | null }>>;
  platform_rankings: Record<string, RankingInfo[]>;
  ranking_changes: Record<string, Record<string, number> | string>;
  surge_daily: Record<string, SurgeItem[]>;
  surge_weekly: Record<string, SurgeItem[]>;
  surge_monthly: Record<string, SurgeItem[]>;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getLastMonthEnd(target: Date): Date {
  const last = new Date(target.getFullYear(), target.getMonth(), 0);
  return last;
}

function buildSurgeDaily(db: Database, targetDateStr: string): Record<string, SurgeItem[]> {
  const result: Record<string, SurgeItem[]> = {};
  const novels = getAllNovels(db);
  const byPlatform: Record<string, ManagementNovel[]> = {};
  for (const p of SURGE_PLATFORMS) byPlatform[p] = [];
  for (const n of novels) {
    const platform = n.platform?.trim();
    if (platform && byPlatform[platform]) byPlatform[platform].push(n);
  }

  for (const platform of SURGE_PLATFORMS) {
    const list: SurgeItem[] = [];
    for (const novel of byPlatform[platform] || []) {
      const stats = getLatestStats(db, novel.id, 2);
      if (stats.length < 2) continue;
      // getLatestStats는 DESC 정렬: stats[0]=최신, stats[1]=이전
      const latest_stat = stats[0];
      const prev_stat = stats[1];
      const pv = prev_stat.views ?? 0;
      const lv = latest_stat.views ?? 0;
      if (lv <= pv) continue;
      const surge = lv - pv;
      const surge_rate = pv > 0 ? (surge / pv) * 100 : 0;
      const item: SurgeItem = {
        novel_id: novel.id,
        title: novel.title,
        author: novel.author || '알 수 없음',
        yesterday_views: pv,
        today_views: lv,
        prev_date: prev_stat.date,
        latest_date: latest_stat.date,
        surge,
        surge_rate,
      };
      if (platform === '문피아' && latest_stat.detail_data) {
        try {
          const dd = JSON.parse(latest_stat.detail_data);
          if (dd?.avg_read_through_rate != null) item.avg_read_through_rate = dd.avg_read_through_rate;
        } catch {}
      }
      list.push(item);
    }
    list.sort((a, b) => b.surge_rate - a.surge_rate);
    result[platform] = list.slice(0, 50);
  }
  return result;
}

function buildSurgeWeekly(db: Database, targetDateStr: string): Record<string, SurgeItem[]> {
  const result: Record<string, SurgeItem[]> = {};
  const novels = getAllNovels(db);
  const byPlatform: Record<string, ManagementNovel[]> = {};
  for (const p of SURGE_PLATFORMS) byPlatform[p] = [];
  for (const n of novels) {
    const platform = n.platform?.trim();
    if (platform && byPlatform[platform]) byPlatform[platform].push(n);
  }

  for (const platform of SURGE_PLATFORMS) {
    const list: SurgeItem[] = [];
    for (const novel of byPlatform[platform] || []) {
      const thisWeekStat = getLatestStats(db, novel.id, 1)[0];
      if (!thisWeekStat || thisWeekStat.date !== targetDateStr) continue;
      const lastWeekStat = getStatBeforeDate(db, novel.id, targetDateStr, 7, 31);
      if (!lastWeekStat) continue;
      const lw = lastWeekStat.views ?? 0;
      const tw = thisWeekStat.views ?? 0;
      if (tw <= lw) continue;
      const surge = tw - lw;
      const surge_rate = lw > 0 ? (surge / lw) * 100 : 0;
      list.push({
        novel_id: novel.id,
        title: novel.title,
        author: novel.author || '알 수 없음',
        last_week_views: lw,
        this_week_views: tw,
        surge,
        surge_rate,
      });
    }
    list.sort((a, b) => b.surge_rate - a.surge_rate);
    result[platform] = list.slice(0, 50);
  }
  return result;
}

function buildSurgeMonthly(db: Database, targetDateStr: string): Record<string, SurgeItem[]> {
  const target = new Date(targetDateStr + 'T12:00:00');
  const lastMonthEnd = getLastMonthEnd(target);
  const lmStr = toDateStr(lastMonthEnd);
  const result: Record<string, SurgeItem[]> = {};
  const novels = getAllNovels(db);
  const byPlatform: Record<string, ManagementNovel[]> = {};
  for (const p of SURGE_PLATFORMS) byPlatform[p] = [];
  for (const n of novels) {
    const platform = n.platform?.trim();
    if (platform && byPlatform[platform]) byPlatform[platform].push(n);
  }

  for (const platform of SURGE_PLATFORMS) {
    const list: SurgeItem[] = [];
    for (const novel of byPlatform[platform] || []) {
      const thisStats = getLatestStats(db, novel.id, 100);
      const thisMonthStat = thisStats.find((s) => s.date === targetDateStr);
      const lastMonthStat = thisStats.find((s) => s.date === lmStr);
      if (!thisMonthStat || !lastMonthStat) continue;
      const lm = lastMonthStat.views ?? 0;
      const tm = thisMonthStat.views ?? 0;
      if (tm <= lm) continue;
      const surge = tm - lm;
      const surge_rate = lm > 0 ? (surge / lm) * 100 : 0;
      list.push({
        novel_id: novel.id,
        title: novel.title,
        author: novel.author || '알 수 없음',
        last_month_views: lm,
        this_month_views: tm,
        surge,
        surge_rate,
      });
    }
    list.sort((a, b) => b.surge_rate - a.surge_rate);
    result[platform] = list.slice(0, 50);
  }
  return result;
}

function buildPlatformRankings(db: Database, dateStr: string): Record<string, RankingInfo[]> {
  const result: Record<string, RankingInfo[]> = {};
  // 고정 플랫폼 먼저, 없으면 해당 날짜에 실제 있는 플랫폼으로 채움
  const platformsInDb = getRankingPlatformsOnDate(db, dateStr);
  const platformsToQuery = RANKING_DISPLAY_PLATFORMS.length > 0
    ? [...new Set([...RANKING_DISPLAY_PLATFORMS, ...platformsInDb])]
    : platformsInDb;
  for (const platform of platformsToQuery) {
    const rows = getRankingsByDateAndPlatform(db, dateStr, platform, 10);
    if (rows.length === 0) continue;
    result[platform] = rows.map((r) => ({
      rank: r.rank,
      title: r.title,
      author: r.author || '',
      publisher: r.publisher || '',
      views: r.views,
      genre: r.genre || '',
      ranking_type: r.ranking_type || 'daily',
      novel_url: r.novel_url || '',
      extra_data: r.extra_data ? (typeof r.extra_data === 'string' ? JSON.parse(r.extra_data) : r.extra_data) : null,
    }));
  }
  return result;
}

function buildRankingChanges(db: Database, dateStr: string): Record<string, Record<string, number> | string> {
  const result: Record<string, Record<string, number> | string> = {};
  for (const platform of RANKING_COMPARE_PLATFORMS) {
    let prevMap: Record<string, number> = {};
    for (const daysAgo of [1, 2]) {
      const d = new Date(dateStr + 'T12:00:00');
      d.setDate(d.getDate() - daysAgo);
      const prevStr = toDateStr(d);
      const prevRows = getRankingsByDateAndPlatform(db, prevStr, platform, 20);
      if (prevRows.length > 0) {
        prevMap = Object.fromEntries(prevRows.map((r: { title: string; rank: number }) => [r.title, r.rank]));
        result[`${platform}_prev_date`] = prevStr;
        break;
      }
    }
    result[platform] = prevMap;
  }
  return result;
}

/** 오늘 날짜 기준 투데이 리포트 — 오늘 데이터 없으면 최신 랭킹 날짜로 폴백 */
export function getTodayReport(db: Database): TodayReportData {
  const today = toDateStr(new Date());
  const novels = getAllNovels(db);
  const byPlatform = getNovelsByPlatform(db);

  // 오늘 랭킹 데이터가 없으면 DB에 있는 최신 날짜 사용
  const todayRankings = getRankingsByDate(db, today);
  const effectiveDate = todayRankings.length > 0 ? today : (getLatestRankingDate(db) || today);

  const new_rankings: TodayReportData['new_rankings'] = {};
  for (const platform of RANKING_DISPLAY_PLATFORMS) {
    const list = (byPlatform[platform] || []).filter((n) => {
      const created = n.created_at?.slice(0, 10);
      return created === today;
    });
    new_rankings[platform] = list.map((n) => ({
      id: n.id,
      title: n.title,
      author: n.author || '알 수 없음',
      platform: n.platform,
      created_at: n.created_at,
    }));
  }

  return {
    date: effectiveDate,
    new_rankings,
    platform_rankings: buildPlatformRankings(db, effectiveDate),
    ranking_changes: buildRankingChanges(db, effectiveDate),
    surge_daily: buildSurgeDaily(db, effectiveDate),
    surge_weekly: buildSurgeWeekly(db, effectiveDate),
    surge_monthly: buildSurgeMonthly(db, effectiveDate),
  };
}

/** 지정 날짜 기준 히스토리 리포트 */
export function getHistoryReport(db: Database, dateStr: string): Omit<TodayReportData, 'new_rankings'> & { new_rankings?: never } {
  return {
    date: dateStr,
    platform_rankings: buildPlatformRankings(db, dateStr),
    ranking_changes: buildRankingChanges(db, dateStr),
    surge_daily: buildSurgeDaily(db, dateStr),
    surge_weekly: buildSurgeWeekly(db, dateStr),
    surge_monthly: buildSurgeMonthly(db, dateStr),
  };
}
