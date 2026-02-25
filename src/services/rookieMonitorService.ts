/**
 * 문피아 신작 모니터링 리포트 (backend rookie_monitor report 포팅)
 * DB에 신작 모니터링 수집 데이터가 있을 때만 의미 있음.
 */
import type { Database } from 'sql.js';
import {
  getRookieMonitorRankingsByDate,
  getStatByDate,
  getLatestRookieMonitorDate,
  ROOKIE_MONITOR_RANKING_TYPES,
} from '../db/queries';

function daysAgo(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export interface NewRookieItem {
  rank: number;
  title: string;
  author: string;
  genre: string;
  novel_url: string;
  novel_id: number | null;
}

export interface SurgeSectionItem {
  novel_id: number | null;
  title: string;
  author: string;
  novel_url: string;
  surge: number;
  surge_rate: number;
  views_today: number;
  views_prev: number;
  avg_read_through_rate: number | null;
}

export interface ReadThroughItem {
  novel_id: number;
  title: string;
  author: string;
  novel_url: string;
  avg_read_through_rate: number | null;
  views: number | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  rookie: '신인 베스트',
  new_novel_today: '신규 베스트',
  genre_heroism: '장르별 무협 베스트',
  genre_fantasy: '장르별 판타지 베스트',
  genre_fusion: '장르별 퓨전 베스트',
  genre_game: '장르별 게임 베스트',
  genre_newfantasy: '장르별 현대판타지 베스트',
  genre_history: '장르별 대체역사 베스트',
};

function parseReadThroughRate(detailData: string | null | undefined): number | null {
  if (!detailData) return null;
  try {
    const o = typeof detailData === 'string' ? JSON.parse(detailData) : detailData;
    const v = o?.avg_read_through_rate;
    return typeof v === 'number' ? v : null;
  } catch {
    return null;
  }
}

export interface RookieMonitorReport {
  date: string;
  new_rookie_today: NewRookieItem[];
  surge_by_section: Record<string, { label: string; items: SurgeSectionItem[] }>;
  top20_read_through: ReadThroughItem[];
  hasData: boolean;
}

export function getRookieMonitorReport(db: Database, dateParam?: string): RookieMonitorReport {
  const targetDate = dateParam || getLatestRookieMonitorDate(db);
  if (!targetDate) {
    return {
      date: '',
      new_rookie_today: [],
      surge_by_section: {},
      top20_read_through: [],
      hasData: false,
    };
  }

  const prevDate = daysAgo(targetDate, 1);
  const todayRanks = getRookieMonitorRankingsByDate(db, targetDate);
  const prevRanks = getRookieMonitorRankingsByDate(db, prevDate);

  const todayRookieIds = new Set<number>();
  const prevRookieIds = new Set<number>();
  for (const r of todayRanks) {
    if (r.ranking_type === 'rookie' && r.novel_id != null) todayRookieIds.add(r.novel_id);
  }
  for (const r of prevRanks) {
    if (r.ranking_type === 'rookie' && r.novel_id != null) prevRookieIds.add(r.novel_id);
  }

  const newRookieIds = new Set([...todayRookieIds].filter((id) => !prevRookieIds.has(id)));
  const new_rookie_today: NewRookieItem[] = todayRanks
    .filter((r) => r.ranking_type === 'rookie' && r.novel_id != null && newRookieIds.has(r.novel_id))
    .sort((a, b) => a.rank - b.rank)
    .map((r) => ({
      rank: r.rank,
      title: r.title,
      author: r.author || '',
      genre: r.genre || '',
      novel_url: r.novel_url || '',
      novel_id: r.novel_id,
    }));

  const surge_by_section: Record<string, { label: string; items: SurgeSectionItem[] }> = {};
  for (const key of ROOKIE_MONITOR_RANKING_TYPES) {
    const sectionRanks = todayRanks.filter((r) => r.ranking_type === key);
    const novelIds = [...new Set(sectionRanks.map((r) => r.novel_id).filter((id): id is number => id != null))];
    const items: SurgeSectionItem[] = [];
    for (const novelId of novelIds) {
      const todayStat = getStatByDate(db, novelId, targetDate);
      const prevStat = getStatByDate(db, novelId, prevDate);
      const prevViews = prevStat?.views != null ? Number(prevStat.views) : 0;
      const currViews = todayStat?.views != null ? Number(todayStat.views) : 0;
      const surge = currViews - prevViews;
      const surgeRate = prevViews > 0 ? (surge / prevViews) * 100 : surge > 0 ? 100 : 0;
      const rankRow = sectionRanks.find((r) => r.novel_id === novelId);
      let avgReadThrough: number | null = null;
      if (todayStat?.detail_data) avgReadThrough = parseReadThroughRate(todayStat.detail_data);
      items.push({
        novel_id: novelId,
        title: rankRow?.title ?? '',
        author: rankRow?.author ?? '',
        novel_url: rankRow?.novel_url ?? '',
        surge,
        surge_rate: Math.round(surgeRate * 10) / 10,
        views_today: currViews,
        views_prev: prevViews,
        avg_read_through_rate: avgReadThrough,
      });
    }
    items.sort((a, b) => b.surge_rate - a.surge_rate);
    surge_by_section[key] = { label: CATEGORY_LABELS[key] ?? key, items: items.slice(0, 20) };
  }

  const allNovelIds = new Set<number>();
  for (const r of todayRanks) {
    if (r.novel_id != null) allNovelIds.add(r.novel_id);
  }
  const readThroughList: Array<{ novel_id: number; avg_read_through_rate: number | null; views: number | null }> = [];
  for (const novelId of allNovelIds) {
    const stat = getStatByDate(db, novelId, targetDate);
    if (!stat?.detail_data) continue;
    const rate = parseReadThroughRate(stat.detail_data);
    if (rate != null) readThroughList.push({ novel_id: novelId, avg_read_through_rate: rate, views: stat?.views != null ? Number(stat.views) : null });
  }
  readThroughList.sort((a, b) => (b.avg_read_through_rate ?? 0) - (a.avg_read_through_rate ?? 0));
  const top20Ids = readThroughList.slice(0, 20).map((x) => x.novel_id);
  const rankMap = new Map<number, { title: string; author: string; novel_url: string }>();
  for (const r of todayRanks) {
    if (r.novel_id != null && top20Ids.includes(r.novel_id) && !rankMap.has(r.novel_id)) {
      rankMap.set(r.novel_id, { title: r.title, author: r.author || '', novel_url: r.novel_url || '' });
    }
  }
  const top20_read_through: ReadThroughItem[] = readThroughList.slice(0, 20).map((x) => ({
    novel_id: x.novel_id,
    title: rankMap.get(x.novel_id)?.title ?? '',
    author: rankMap.get(x.novel_id)?.author ?? '',
    novel_url: rankMap.get(x.novel_id)?.novel_url ?? '',
    avg_read_through_rate: x.avg_read_through_rate,
    views: x.views,
  }));

  return {
    date: targetDate,
    new_rookie_today,
    surge_by_section,
    top20_read_through,
    hasData: todayRanks.length > 0,
  };
}
