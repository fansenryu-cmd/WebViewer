/**
 * 롱텀 데이터 분석 서비스 — 브라우저 내 sql.js 기반 분석
 *
 * 6개 분석 모듈을 TypeScript로 포팅:
 * 1. 랭킹 체류 분석
 * 2. 장르 생태계 변화
 * 3. 출판사/작가 시장 점유율
 * 4. 프로모션 효과 계량화
 * 5. 계절성/주기성 분석
 * 6. 키워드 트렌드 진화
 */
import type { Database } from 'sql.js';
import {
  getRankingDataSince,
  getMonthlyGenreCounts,
  getMonthlyPublisherCounts,
  getAuthorDailyTitles,
  getPromotionStats,
  getDayOfWeekRankingCounts,
  getDayOfWeekRankingDetail,
  getMonthlyViewsVolume,
  getMonthlyRankingCounts,
  getMonthlyTitlesWithRank,
  getTitleLaunchDates,
} from '../db/queries';

// ─── 공통 ───

interface AnalysisResult<T> {
  error: string | null;
  data: T | null;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ─── 제목 토크나이저 (text_mining.py 포팅) ───

const STOPWORDS = new Set([
  '의', '에', '는', '은', '이', '가', '를', '을', '과', '와', '로', '으로',
  '에서', '한', '하는', '된', '되는', '그', '저', '이런', '그런', '나',
  '내', '너', '당신', '우리', '것', '수', '중', '더', '안', '못',
]);

function tokenizeTitle(title: string): string[] {
  if (!title) return [];
  const cleaned = title.replace(/[^\w가-힣a-zA-Z0-9\s]/g, ' ');
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  let result = tokens.filter(t => t.length >= 2 && !STOPWORDS.has(t));
  if (result.length === 0) {
    result = tokens.filter(t => t.length > 0 && !STOPWORDS.has(t));
  }
  return result;
}

// ─── HHI / CR 계산 (market_concentration.py 포팅) ───

function computeHHI(shares: number[]): number {
  return shares.reduce((sum, s) => sum + s * s, 0) * 10000;
}

function computeCR(shares: number[], k: number): number {
  const sorted = [...shares].sort((a, b) => b - a);
  return sorted.slice(0, k).reduce((s, v) => s + v, 0);
}

// ═══════════════════════════════════════════
// 1. 랭킹 체류 분석
// ═══════════════════════════════════════════

export function analyzeRankingTenure(db: Database, months = 6): AnalysisResult<any> {
  const cutoff = daysAgo(months * 30);
  const rows = getRankingDataSince(db, cutoff);

  if (rows.length === 0) {
    return { error: `최근 ${months}개월 랭킹 데이터가 없습니다.`, data: null };
  }

  // 작품+플랫폼별 집계
  const novelMap = new Map<string, { dates: Set<string>; ranks: number[]; platform: string; author: string; genre: string }>();

  for (const r of rows) {
    const key = `${r.title}||${r.platform}`;
    if (!novelMap.has(key)) {
      novelMap.set(key, { dates: new Set(), ranks: [], platform: r.platform, author: r.author, genre: r.genre });
    }
    const nd = novelMap.get(key)!;
    nd.dates.add(r.ranking_date);
    nd.ranks.push(r.rank);
  }

  const topNovels: any[] = [];
  const platformTenure: Record<string, number[]> = {};

  for (const [key, nd] of novelMap) {
    const title = key.split('||')[0];
    const sortedDates = [...nd.dates].sort();
    const totalDays = sortedDates.length;
    const top10Days = nd.ranks.filter(r => r <= 10).length;
    const top20Days = nd.ranks.filter(r => r <= 20).length;
    const avgRank = Math.round(nd.ranks.reduce((s, v) => s + v, 0) / nd.ranks.length * 10) / 10;
    const bestRank = Math.min(...nd.ranks);
    const maxStreak = computeMaxStreak(sortedDates);

    topNovels.push({
      title, platform: nd.platform, author: nd.author, genre: nd.genre,
      total_days: totalDays, top10_days: top10Days, top20_days: top20Days,
      avg_rank: avgRank, best_rank: bestRank, max_streak: maxStreak,
      first_seen: sortedDates[0], last_seen: sortedDates[sortedDates.length - 1],
    });

    if (!platformTenure[nd.platform]) platformTenure[nd.platform] = [];
    platformTenure[nd.platform].push(totalDays);
  }

  topNovels.sort((a, b) => b.total_days - a.total_days);
  const top50 = topNovels.slice(0, 50);

  const platformAverages = Object.entries(platformTenure).map(([platform, days]) => ({
    platform,
    avg_days: Math.round(days.reduce((s, v) => s + v, 0) / days.length * 10) / 10,
    max_days: Math.max(...days),
    novel_count: days.length,
  })).sort((a, b) => b.avg_days - a.avg_days);

  const allDays = topNovels.map(n => n.total_days);
  const tierDistribution = {
    '1_to_3_days': allDays.filter(d => d <= 3).length,
    '4_to_7_days': allDays.filter(d => d >= 4 && d <= 7).length,
    '8_to_14_days': allDays.filter(d => d >= 8 && d <= 14).length,
    '15_to_30_days': allDays.filter(d => d >= 15 && d <= 30).length,
    '31_plus_days': allDays.filter(d => d > 30).length,
    total_novels: allDays.length,
  };

  // 최근 3개월 내 활동한 TOP 20
  const recentCutoff = daysAgo(90);
  const recentTopNovels = topNovels
    .filter(n => n.last_seen >= recentCutoff)
    .sort((a, b) => b.total_days - a.total_days)
    .slice(0, 20);

  return {
    error: null,
    data: { top_novels: top50, recent_top_novels: recentTopNovels, platform_averages: platformAverages, tier_distribution: tierDistribution, period_months: months },
  };
}

function computeMaxStreak(sortedDates: string[]): number {
  if (sortedDates.length === 0) return 0;
  let maxStreak = 1, cur = 1;
  for (let i = 1; i < sortedDates.length; i++) {
    const d1 = new Date(sortedDates[i - 1] + 'T00:00:00Z');
    const d2 = new Date(sortedDates[i] + 'T00:00:00Z');
    if ((d2.getTime() - d1.getTime()) / 86400000 === 1) {
      cur++;
      maxStreak = Math.max(maxStreak, cur);
    } else {
      cur = 1;
    }
  }
  return maxStreak;
}

// ═══════════════════════════════════════════
// 2. 장르 생태계 변화
// ═══════════════════════════════════════════

export function analyzeGenreEcosystem(db: Database, months = 12): AnalysisResult<any> {
  const cutoff = daysAgo(months * 30);
  const rows = getMonthlyGenreCounts(db, cutoff);

  if (rows.length === 0) {
    return { error: `최근 ${months}개월 장르 데이터가 없습니다.`, data: null };
  }

  const monthlyCounts: Record<string, Record<string, number>> = {};
  const allGenres = new Set<string>();

  for (const r of rows) {
    const genre = r.genre.trim();
    if (!genre) continue;
    if (!monthlyCounts[r.month]) monthlyCounts[r.month] = {};
    monthlyCounts[r.month][genre] = (monthlyCounts[r.month][genre] || 0) + r.cnt;
    allGenres.add(genre);
  }

  const monthsSorted = Object.keys(monthlyCounts).sort();
  const monthlyDistribution = monthsSorted.map(month => {
    const gc = monthlyCounts[month];
    const total = Object.values(gc).reduce((s, v) => s + v, 0);
    const entry: Record<string, any> = { month, total };
    for (const genre of [...allGenres].sort()) {
      entry[genre] = total > 0 ? Math.round((gc[genre] || 0) / total * 1000) / 10 : 0;
    }
    return entry;
  });

  // Rising / Declining
  const rising: any[] = [];
  const declining: any[] = [];

  if (monthsSorted.length >= 4) {
    const recent3 = monthsSorted.slice(-3);
    const earlier = monthsSorted.slice(0, -3);

    for (const genre of allGenres) {
      const recentAvg = avgShare(monthlyCounts, recent3, genre);
      const earlierAvg = avgShare(monthlyCounts, earlier, genre);
      let changePct: number;

      if (earlierAvg > 0) {
        changePct = Math.round((recentAvg - earlierAvg) / earlierAvg * 1000) / 10;
      } else if (recentAvg > 0) {
        changePct = 100;
      } else continue;

      const entry = { genre, recent_avg_share: Math.round(recentAvg * 10) / 10, earlier_avg_share: Math.round(earlierAvg * 10) / 10, change_pct: changePct };

      if (changePct >= 50) rising.push(entry);
      else if (changePct <= -30) declining.push(entry);
    }
  }

  rising.sort((a, b) => b.change_pct - a.change_pct);
  declining.sort((a, b) => a.change_pct - b.change_pct);

  return {
    error: null,
    data: { monthly_distribution: monthlyDistribution, rising_genres: rising, declining_genres: declining, genre_list: [...allGenres].sort(), period_months: months },
  };
}

function avgShare(monthlyCounts: Record<string, Record<string, number>>, months: string[], genre: string): number {
  if (months.length === 0) return 0;
  const shares = months.map(m => {
    const total = Object.values(monthlyCounts[m] || {}).reduce((s, v) => s + v, 0);
    return total > 0 ? (monthlyCounts[m]?.[genre] || 0) / total * 100 : 0;
  });
  return shares.reduce((s, v) => s + v, 0) / shares.length;
}

// ═══════════════════════════════════════════
// 3. 출판사/작가 시장 점유율
// ═══════════════════════════════════════════

export function analyzePublisherMarket(db: Database, months = 12): AnalysisResult<any> {
  const cutoff = daysAgo(months * 30);
  const pubRows = getMonthlyPublisherCounts(db, cutoff);

  if (pubRows.length === 0) {
    return { error: `최근 ${months}개월 출판사 데이터가 없습니다.`, data: null };
  }

  const monthlyPubCounts: Record<string, Record<string, number>> = {};
  for (const r of pubRows) {
    const pub = r.publisher.trim();
    if (!pub) continue;
    if (!monthlyPubCounts[r.month]) monthlyPubCounts[r.month] = {};
    monthlyPubCounts[r.month][pub] = (monthlyPubCounts[r.month][pub] || 0) + r.cnt;
  }

  const monthsSorted = Object.keys(monthlyPubCounts).sort();
  const hhiTrend: any[] = [];
  const monthlyShares: any[] = [];

  for (const month of monthsSorted) {
    const pc = monthlyPubCounts[month];
    const total = Object.values(pc).reduce((s, v) => s + v, 0);
    if (total === 0) continue;

    const shares = Object.values(pc).map(c => c / total);
    hhiTrend.push({
      month,
      hhi: Math.round(computeHHI(shares) * 10) / 10,
      cr3: Math.round(computeCR(shares, 3) * 1000) / 10,
      cr5: Math.round(computeCR(shares, 5) * 1000) / 10,
    });

    const sorted = Object.entries(pc).sort(([, a], [, b]) => b - a);
    const entry: Record<string, any> = { month, total };
    let others = 0;
    sorted.forEach(([pub, cnt], i) => {
      if (i < 10) entry[pub] = Math.round(cnt / total * 1000) / 10;
      else others += cnt;
    });
    if (others > 0) entry['기타'] = Math.round(others / total * 1000) / 10;
    monthlyShares.push(entry);
  }

  const topPublishers = monthlyShares.length > 0
    ? Object.keys(monthlyShares[monthlyShares.length - 1]).filter(k => !['month', 'total', '기타'].includes(k))
    : [];

  // 다작 작가 분석
  const authorRows = getAuthorDailyTitles(db, cutoff);
  const authorDaily: Record<string, Record<string, Set<string>>> = {};
  const authorTitles: Record<string, Set<string>> = {};

  for (const r of authorRows) {
    const author = r.author.trim();
    if (!author) continue;
    if (!authorDaily[author]) authorDaily[author] = {};
    if (!authorDaily[author][r.ranking_date]) authorDaily[author][r.ranking_date] = new Set();
    authorDaily[author][r.ranking_date].add(r.title);
    if (!authorTitles[author]) authorTitles[author] = new Set();
    authorTitles[author].add(r.title);
  }

  const prolificAuthors: any[] = [];
  for (const [author, daily] of Object.entries(authorDaily)) {
    const multiDays = Object.values(daily).filter(titles => titles.size >= 2).length;
    if (multiDays < 3) continue;
    const totalDays = Object.keys(daily).length;
    const titles = [...(authorTitles[author] || [])].sort().slice(0, 5);
    prolificAuthors.push({
      author, unique_titles: authorTitles[author]?.size || 0, titles,
      multi_ranking_days: multiDays, total_ranking_days: totalDays,
      multi_ratio: totalDays > 0 ? Math.round(multiDays / totalDays * 1000) / 10 : 0,
    });
  }
  prolificAuthors.sort((a, b) => b.multi_ranking_days - a.multi_ranking_days);

  // 다작 작가 대표 작품의 launch_date 조회
  const allTitles = new Set<string>();
  for (const a of prolificAuthors.slice(0, 20)) {
    for (const t of a.titles) allTitles.add(t);
  }
  const launchRows = getTitleLaunchDates(db, [...allTitles]);
  const titleLaunchDates: Record<string, string | null> = {};
  for (const r of launchRows) {
    titleLaunchDates[r.title] = r.launch_date;
  }

  return {
    error: null,
    data: { monthly_shares: monthlyShares, hhi_trend: hhiTrend, prolific_authors: prolificAuthors.slice(0, 20), top_publishers: topPublishers, title_launch_dates: titleLaunchDates, period_months: months },
  };
}

// ═══════════════════════════════════════════
// 4. 프로모션 효과 계량화
// ═══════════════════════════════════════════

export function analyzePromotionEffect(db: Database, months = 12): AnalysisResult<any> {
  const cutoff = daysAgo(months * 30);
  const rows = getPromotionStats(db, cutoff);

  if (rows.length === 0) {
    return { error: '프로모션 분석에 사용할 일일 통계 데이터가 없습니다.', data: null };
  }

  // 소설별 타임라인 구성
  const timelines: Record<number, Array<{ date: string; views: number; promo_active: boolean; tags: string[]; note: string; delta: number }>> = {};
  const novelInfo: Record<number, { title: string; platform: string }> = {};

  for (const r of rows) {
    if (!timelines[r.novel_id]) timelines[r.novel_id] = [];
    let tags: string[] = [];
    try { tags = r.promotion_tags ? JSON.parse(r.promotion_tags) : []; } catch { /* skip */ }
    timelines[r.novel_id].push({
      date: r.date, views: r.views, promo_active: !!r.promotion_active,
      tags: Array.isArray(tags) ? tags : [], note: r.promotion_note || '', delta: 0,
    });
    novelInfo[r.novel_id] = { title: r.title, platform: r.platform };
  }

  const promotionEvents: any[] = [];
  const tagLifts: Record<string, number[]> = {};

  for (const [nidStr, tl] of Object.entries(timelines)) {
    const nid = Number(nidStr);
    tl.sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 1; i < tl.length; i++) tl[i].delta = Math.max(0, tl[i].views - tl[i - 1].views);

    // 프로모션 구간 감지
    let i = 0;
    while (i < tl.length) {
      if (tl[i].promo_active) {
        const start = i;
        const eventTags = new Set<string>();
        while (i < tl.length && tl[i].promo_active) {
          tl[i].tags.forEach(t => eventTags.add(t));
          if (tl[i].note) eventTags.add(tl[i].note);
          i++;
        }
        const end = i - 1;

        const beforeStart = Math.max(0, start - 7);
        const beforeDeltas = tl.slice(beforeStart, start).filter(t => !t.promo_active).map(t => t.delta);
        const duringDeltas = tl.slice(start, end + 1).map(t => t.delta);
        const afterEnd = Math.min(tl.length, end + 8);
        const afterDeltas = tl.slice(end + 1, afterEnd).filter(t => !t.promo_active).map(t => t.delta);

        const beforeAvg = beforeDeltas.length > 0 ? beforeDeltas.reduce((s, v) => s + v, 0) / beforeDeltas.length : 0;
        const duringAvg = duringDeltas.length > 0 ? duringDeltas.reduce((s, v) => s + v, 0) / duringDeltas.length : 0;
        const afterAvg = afterDeltas.length > 0 ? afterDeltas.reduce((s, v) => s + v, 0) / afterDeltas.length : 0;
        const lift = beforeAvg > 0 ? Math.round((duringAvg - beforeAvg) / beforeAvg * 1000) / 10 : 0;

        const tags = [...eventTags].sort();
        promotionEvents.push({
          novel_id: nid, title: novelInfo[nid]?.title || '', platform: novelInfo[nid]?.platform || '',
          start_date: tl[start].date, end_date: tl[end].date, duration_days: end - start + 1,
          before_avg_delta: Math.round(beforeAvg * 10) / 10, during_avg_delta: Math.round(duringAvg * 10) / 10,
          after_avg_delta: Math.round(afterAvg * 10) / 10, lift_pct: lift, tags,
        });

        for (const tag of tags) {
          if (!tagLifts[tag]) tagLifts[tag] = [];
          tagLifts[tag].push(lift);
        }
      } else {
        i++;
      }
    }
  }

  const tagEffectiveness = Object.entries(tagLifts).map(([tag, lifts]) => ({
    tag, avg_lift_pct: Math.round(lifts.reduce((s, v) => s + v, 0) / lifts.length * 10) / 10,
    max_lift_pct: Math.round(Math.max(...lifts) * 10) / 10, event_count: lifts.length,
  })).sort((a, b) => b.avg_lift_pct - a.avg_lift_pct);

  const allLifts = promotionEvents.map(e => e.lift_pct);
  const overallSummary = {
    total_events: promotionEvents.length,
    avg_lift_pct: allLifts.length > 0 ? Math.round(allLifts.reduce((s, v) => s + v, 0) / allLifts.length * 10) / 10 : 0,
    positive_events: allLifts.filter(l => l > 0).length,
    negative_events: allLifts.filter(l => l < 0).length,
    neutral_events: allLifts.filter(l => l === 0).length,
  };

  promotionEvents.sort((a: any, b: any) => b.lift_pct - a.lift_pct);

  return {
    error: null,
    data: { promotion_events: promotionEvents.slice(0, 20), tag_effectiveness: tagEffectiveness, overall_summary: overallSummary, period_months: months },
  };
}

// ═══════════════════════════════════════════
// 5. 계절성/주기성 분석
// ═══════════════════════════════════════════

const DAY_NAMES = ['월', '화', '수', '목', '금', '토', '일'];

export function analyzeSeasonality(db: Database, months = 12): AnalysisResult<any> {
  const cutoff = daysAgo(months * 30);

  // 요일별 랭킹 분석
  const dowRows = getDayOfWeekRankingCounts(db, cutoff);
  const dowData: Record<number, number[]> = {};
  for (const r of dowRows) {
    const dowIdx = parseInt(r.dow);
    const koreanIdx = (dowIdx - 1 + 7) % 7; // 0=일→6, 1=월→0, ...
    if (!dowData[koreanIdx]) dowData[koreanIdx] = [];
    dowData[koreanIdx].push(r.cnt);
  }

  const dayOfWeek = DAY_NAMES.map((day, i) => {
    const counts = dowData[i] || [];
    return {
      day, day_index: i,
      avg_entries: counts.length > 0 ? Math.round(counts.reduce((s, v) => s + v, 0) / counts.length * 10) / 10 : 0,
      max_entries: counts.length > 0 ? Math.max(...counts) : 0,
      min_entries: counts.length > 0 ? Math.min(...counts) : 0,
      sample_days: counts.length,
    };
  });

  // 월별 볼륨
  const monthlyStats = getMonthlyViewsVolume(db, cutoff);
  const monthlyVolume: any[] = [];
  let prevViews: number | null = null;
  for (const ms of monthlyStats) {
    const totalViews = ms.total_views || 0;
    let delta = 0, growthPct = 0;
    if (prevViews !== null && prevViews > 0) {
      delta = totalViews - prevViews;
      growthPct = Math.round(delta / prevViews * 1000) / 10;
    }
    monthlyVolume.push({
      month: ms.month, total_views: Math.round(totalViews * 10) / 10,
      delta: Math.round(delta * 10) / 10, growth_pct: growthPct,
      novel_count: ms.novel_count, entry_count: ms.entry_count,
    });
    prevViews = totalViews;
  }

  // 분기별 성장률
  const quarterlyData: Record<string, { views: number; entries: number }> = {};
  for (const mv of monthlyVolume) {
    const year = mv.month.slice(0, 4);
    const monthNum = parseInt(mv.month.slice(5, 7));
    const q = `${year}-Q${Math.ceil(monthNum / 3)}`;
    if (!quarterlyData[q]) quarterlyData[q] = { views: 0, entries: 0 };
    quarterlyData[q].views += mv.total_views;
    quarterlyData[q].entries += mv.entry_count;
  }

  const quartersSorted = Object.keys(quarterlyData).sort();
  const quarterlyGrowth: any[] = [];
  let prevQViews: number | null = null;
  for (const q of quartersSorted) {
    const qd = quarterlyData[q];
    const growthPct = prevQViews !== null && prevQViews > 0
      ? Math.round((qd.views - prevQViews) / prevQViews * 1000) / 10 : 0;
    quarterlyGrowth.push({
      quarter: q, total_views: Math.round(qd.views * 10) / 10,
      entry_count: qd.entries, growth_pct: growthPct,
    });
    prevQViews = qd.views;
  }

  // 월별 랭킹 작품수
  const monthlyRanking = getMonthlyRankingCounts(db, cutoff);

  // 요일별 플랫폼·장르 상세
  const detailRows = getDayOfWeekRankingDetail(db, cutoff);
  const dowDetailMap: Record<number, Record<string, Record<string, number>>> = {};
  for (const r of detailRows) {
    const dowIdx = parseInt(r.dow);
    const koreanIdx = (dowIdx - 1 + 7) % 7;
    if (!dowDetailMap[koreanIdx]) dowDetailMap[koreanIdx] = {};
    const platform = r.platform || '기타';
    if (!dowDetailMap[koreanIdx][platform]) dowDetailMap[koreanIdx][platform] = {};
    const genre = r.genre || '기타';
    dowDetailMap[koreanIdx][platform][genre] = (dowDetailMap[koreanIdx][platform][genre] || 0) + 1;
  }

  const dayOfWeekDetail = DAY_NAMES.map((day, i) => {
    const platforms: Record<string, { total: number; genres: { genre: string; count: number; share: number }[] }> = {};
    const platData = dowDetailMap[i] || {};
    for (const [platform, genreCounts] of Object.entries(platData)) {
      const total = Object.values(genreCounts).reduce((s, v) => s + v, 0);
      const genres = Object.entries(genreCounts)
        .map(([genre, count]) => ({ genre, count, share: total > 0 ? Math.round(count / total * 1000) / 10 : 0 }))
        .sort((a, b) => b.count - a.count);
      platforms[platform] = { total, genres };
    }
    return { day, day_index: i, platforms };
  });

  if (dowRows.length === 0 && monthlyStats.length === 0) {
    return { error: `최근 ${months}개월 데이터가 없습니다.`, data: null };
  }

  return {
    error: null,
    data: {
      day_of_week: dayOfWeek, day_of_week_detail: dayOfWeekDetail, monthly_volume: monthlyVolume,
      quarterly_growth: quarterlyGrowth, monthly_ranking: monthlyRanking,
      period_months: months,
    },
  };
}

// ═══════════════════════════════════════════
// 6. 키워드 트렌드 진화
// ═══════════════════════════════════════════

export function analyzeKeywordTrend(db: Database, months = 12, topN = 20): AnalysisResult<any> {
  const cutoff = daysAgo(months * 30);
  const rows = getMonthlyTitlesWithRank(db, cutoff);

  if (rows.length === 0) {
    return { error: `최근 ${months}개월 랭킹 데이터가 없습니다.`, data: null };
  }

  const monthlyKeywords: Record<string, Record<string, number>> = {};
  const keywordRanks: Record<string, number[]> = {};
  const seenPerMonth: Record<string, Set<string>> = {};

  for (const r of rows) {
    if (!seenPerMonth[r.month]) seenPerMonth[r.month] = new Set();
    if (seenPerMonth[r.month].has(r.title)) continue;
    seenPerMonth[r.month].add(r.title);

    if (!monthlyKeywords[r.month]) monthlyKeywords[r.month] = {};
    const tokens = tokenizeTitle(r.title);
    for (const token of tokens) {
      monthlyKeywords[r.month][token] = (monthlyKeywords[r.month][token] || 0) + 1;
      if (!keywordRanks[token]) keywordRanks[token] = [];
      keywordRanks[token].push(r.rank);
    }
  }

  // 전체 빈도
  const totalCounter: Record<string, number> = {};
  for (const mc of Object.values(monthlyKeywords)) {
    for (const [kw, cnt] of Object.entries(mc)) {
      totalCounter[kw] = (totalCounter[kw] || 0) + cnt;
    }
  }

  const topKeywords = Object.entries(totalCounter)
    .sort(([, a], [, b]) => b - a)
    .slice(0, topN)
    .map(([kw]) => kw);

  const monthsSorted = Object.keys(monthlyKeywords).sort();
  const keywordMonthlyTrend = monthsSorted.map(month => {
    const mc = monthlyKeywords[month];
    const total = Object.values(mc).reduce((s, v) => s + v, 0);
    const entry: Record<string, any> = { month };
    for (const kw of topKeywords) {
      const cnt = mc[kw] || 0;
      entry[kw] = cnt;
      entry[`${kw}_pct`] = total > 0 ? Math.round(cnt / total * 1000) / 10 : 0;
    }
    return entry;
  });

  // Rising / Falling
  const rising: any[] = [];
  const falling: any[] = [];

  if (monthsSorted.length >= 4) {
    const recent3 = monthsSorted.slice(-3);
    const earlier = monthsSorted.slice(0, -3);

    for (const [kw, total] of Object.entries(totalCounter)) {
      if (total < 3) continue;
      const recentAvg = avgFreq(monthlyKeywords, recent3, kw);
      const earlierAvg = avgFreq(monthlyKeywords, earlier, kw);
      let changePct: number;

      if (earlierAvg > 0) changePct = Math.round((recentAvg - earlierAvg) / earlierAvg * 1000) / 10;
      else if (recentAvg > 1) changePct = 100;
      else continue;

      const entry = { keyword: kw, recent_avg_freq: Math.round(recentAvg * 10) / 10, earlier_avg_freq: Math.round(earlierAvg * 10) / 10, change_pct: changePct, total_count: total };

      if (changePct >= 50) rising.push(entry);
      else if (changePct <= -30) falling.push(entry);
    }
  }

  rising.sort((a, b) => b.change_pct - a.change_pct);
  falling.sort((a, b) => a.change_pct - b.change_pct);

  // 순위 상관관계
  const rankCorrelation = topKeywords.map(kw => {
    const ranks = keywordRanks[kw] || [];
    return {
      keyword: kw,
      avg_rank: ranks.length > 0 ? Math.round(ranks.reduce((s, v) => s + v, 0) / ranks.length * 10) / 10 : 0,
      appearances: ranks.length,
      top10_pct: ranks.length > 0 ? Math.round(ranks.filter(r => r <= 10).length / ranks.length * 1000) / 10 : 0,
    };
  }).sort((a, b) => a.avg_rank - b.avg_rank);

  return {
    error: null,
    data: {
      keyword_monthly_trend: keywordMonthlyTrend, top_keywords: topKeywords,
      rising: rising.slice(0, 15), falling: falling.slice(0, 15),
      rank_correlation: rankCorrelation, period_months: months,
    },
  };
}

function avgFreq(monthlyKeywords: Record<string, Record<string, number>>, months: string[], keyword: string): number {
  if (months.length === 0) return 0;
  const freqs = months.map(m => monthlyKeywords[m]?.[keyword] || 0);
  return freqs.reduce((s, v) => s + v, 0) / freqs.length;
}
