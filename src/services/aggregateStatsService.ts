/**
 * 통합 통계 서비스 — aggregate-stats 로직 (daily_stats.py + utils.py 포팅)
 */
import type { Database } from 'sql.js';
import {
  getNovelsWithLaunchDate,
  getAllStatsForAggregate,
  getDailyStats,
} from '../db/queries';
import type { ManagementNovel } from '../db/types';
import type { SeriesPoint } from '../db/types';

const PLATFORM_ORDER = ['카카오', '네이버', '문피아', '리디', '노벨피아'];

const PLATFORM_CANONICAL: [string, string[]][] = [
  ['문피아', ['문피아', 'munpia', '문피아닷컴']],
  ['네이버', ['네이버', 'naver', '네이버시리즈', '네이버 시리즈']],
  ['카카오', ['카카오', 'kakao', '카카오페이지', '카카오 페이지']],
  ['리디', ['리디', 'ridi', '리디북스']],
  ['노벨피아', ['노벨피아', 'novelpia']],
];

function normalizePlatform(name: string | null | undefined): string {
  if (!name || !String(name).trim()) return '미분류';
  const s = String(name).trim();
  const lower = s.toLowerCase();
  for (const [canonical, variants] of PLATFORM_CANONICAL) {
    for (const v of variants) {
      if (lower.includes(v.toLowerCase()) || s.includes(v)) return canonical;
    }
  }
  return s;
}

function parseDate(dateStr: string): Date {
  return new Date(dateStr + 'T12:00:00');
}

/** 한 작품의 (daysSinceLaunch, cumulativeViews) 시리즈 + 총 조회수 (다중 작품 비교용 export) */
export function buildNovelSeries(
  launchDateStr: string,
  rows: Array<{ date: string; views: number }>,
): { total: number; series: SeriesPoint[] } {
  if (!rows.length) return { total: 0, series: [] };

  const launch = parseDate(launchDateStr);
  const byDay: Record<number, number> = {};

  for (const r of rows) {
    const d = parseDate(r.date);
    const days = Math.floor((d.getTime() - launch.getTime()) / (24 * 60 * 60 * 1000));
    if (days < 0) continue;
    const v = Number(r.views) || 0;
    if (days in byDay) {
      byDay[days] = Math.max(byDay[days], v);
    } else {
      byDay[days] = v;
    }
  }

  const sortedDays = Object.keys(byDay)
    .map(Number)
    .sort((a, b) => a - b);
  if (sortedDays.length === 0) return { total: 0, series: [] };

  const firstDataDay = sortedDays[0];
  const maxDay = sortedDays[sortedDays.length - 1];
  const firstDataValue = byDay[firstDataDay];
  const series: SeriesPoint[] = [];
  let prevCumulative = 0;

  // 런칭일(day 0)은 항상 Y=0에서 시작 — 백엔드 _build_novel_series와 동일
  for (let day = 0; day <= maxDay; day++) {
    if (day === 0) {
      series.push({ daysSinceLaunch: 0, cumulativeViews: 0 });
      prevCumulative = 0;
      continue;
    }
    if (day in byDay) {
      let cumulative = byDay[day];
      if (cumulative < prevCumulative) cumulative = prevCumulative;
      prevCumulative = cumulative;
      series.push({ daysSinceLaunch: day, cumulativeViews: cumulative });
    } else if (day < firstDataDay) {
      // 런칭일~최초수집일: 선형 보간 (0 → firstDataValue)
      const interpolated =
        firstDataDay > 0 ? Math.floor((firstDataValue * day) / firstDataDay) : 0;
      prevCumulative = interpolated;
      series.push({ daysSinceLaunch: day, cumulativeViews: interpolated });
    } else {
      series.push({ daysSinceLaunch: day, cumulativeViews: prevCumulative });
    }
  }

  return { total: prevCumulative, series };
}

function aggregateSeries(
  groups: Array<{ novelId: number; total: number; series: SeriesPoint[] }>,
): SeriesPoint[] {
  if (!groups.length) return [];

  const allDays = new Set<number>();
  for (const { series } of groups) {
    for (const pt of series) allDays.add(pt.daysSinceLaunch);
  }
  const days = Array.from(allDays).sort((a, b) => a - b);
  if (days.length === 0) return [];

  const minDay = 0;
  const maxDay = Math.max(...days);
  const byDay: Record<number, number[]> = {};

  for (const { series } of groups) {
    const seriesMap = Object.fromEntries(series.map((p) => [p.daysSinceLaunch, p.cumulativeViews]));
    let prevVal = 0;
    for (let day = minDay; day <= maxDay; day++) {
      if (!(day in byDay)) byDay[day] = [];
      if (day in seriesMap) {
        let val = seriesMap[day];
        if (val < prevVal) val = prevVal;
        prevVal = val;
        byDay[day].push(val);
      } else {
        byDay[day].push(prevVal);
      }
    }
  }

  const out: SeriesPoint[] = [];
  let prevMedian = 0;
  for (let d = minDay; d <= maxDay; d++) {
    const vals = byDay[d] || [];
    if (!vals.length) continue;
    vals.sort((a, b) => a - b);
    let medianVal = vals[Math.floor(vals.length / 2)] || 0;
    if (medianVal < prevMedian) medianVal = prevMedian;
    prevMedian = medianVal;
    out.push({ daysSinceLaunch: d, cumulativeViews: medianVal });
  }
  // 0일이 없으면 맨 앞에 (0, 0) 추가 — 런칭일 0조회수 기준
  if (out.length > 0 && out[0].daysSinceLaunch !== 0) {
    out.unshift({ daysSinceLaunch: 0, cumulativeViews: 0 });
  }
  return out;
}

export interface PlatformAggregateData {
  top20: SeriesPoint[];
  top40: SeriesPoint[];
  top60: SeriesPoint[];
  top80: SeriesPoint[];
  myNovel: SeriesPoint[] | null;
  percentileTop: number | null;
  totalNovels: number;
}

export interface AggregateStatsResponse {
  byPlatform: Record<string, PlatformAggregateData>;
  platforms: string[];
}

export function getAggregateStats(db: Database, selectedNovelId?: number | null): AggregateStatsResponse {
  const novels = getNovelsWithLaunchDate(db);
  if (!novels.length) return { byPlatform: {}, platforms: [] };

  const allStats = getAllStatsForAggregate(db);
  const byNovel: Record<number, Array<{ date: string; views: number }>> = {};
  for (const n of novels) byNovel[n.id] = [];
  for (const row of allStats) {
    const nid = row.novel_id;
    if (nid in byNovel) {
      byNovel[nid].push({ date: row.date, views: Number(row.views) || 0 });
    }
  }

  const platformNovels: Record<string, ManagementNovel[]> = {};
  for (const n of novels) {
    const key = normalizePlatform(n.platform);
    if (!platformNovels[key]) platformNovels[key] = [];
    platformNovels[key].push(n);
  }

  const byPlatform: Record<string, PlatformAggregateData> = {};
  const seenPlatforms = new Set<string>();

  for (const [platformKey, platformList] of Object.entries(platformNovels)) {
    const novelTotals: Array<{ novelId: number; total: number; series: SeriesPoint[] }> = [];
    for (const n of platformList) {
      const launch = n.launch_date;
      if (!launch) continue;
      const rows = byNovel[n.id] || [];
      if (!rows.length) continue;
      const { total, series } = buildNovelSeries(launch, rows);
      novelTotals.push({ novelId: n.id, total, series });
    }
    if (!novelTotals.length) continue;
    seenPlatforms.add(platformKey);

    novelTotals.sort((a, b) => b.total - a.total);
    const N = novelTotals.length;

    const tier = (start: number, end: number) => {
      const s = Math.max(0, Math.floor((N * start) / 100));
      const e = Math.max(s + 1, Math.floor((N * end) / 100));
      return novelTotals.slice(s, e);
    };

    const top20 = aggregateSeries(tier(0, 20));
    const top40 = aggregateSeries(tier(20, 40));
    const top60 = aggregateSeries(tier(40, 60));
    const top80 = aggregateSeries(tier(60, 80));

    let mySeries: SeriesPoint[] | null = null;
    let percentileTop: number | null = null;
    if (selectedNovelId != null) {
      const found = novelTotals.find((t) => t.novelId === selectedNovelId);
      if (found) {
        mySeries = found.series;
        const countBetter = novelTotals.filter((t) => t.total > found.total).length;
        percentileTop = N ? Math.round(((countBetter + 1) / N) * 1000) / 10 : null;
      }
    }

    byPlatform[platformKey] = {
      top20,
      top40,
      top60,
      top80,
      myNovel: mySeries,
      percentileTop,
      totalNovels: N,
    };
  }

  const ordered = PLATFORM_ORDER.filter((p) => seenPlatforms.has(p));
  for (const p of Array.from(seenPlatforms).sort()) {
    if (!ordered.includes(p)) ordered.push(p);
  }

  return { byPlatform, platforms: ordered };
}
