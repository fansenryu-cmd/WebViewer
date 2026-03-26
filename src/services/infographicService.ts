/**
 * 인포그래픽 데이터 서비스
 * SQLite DB에서 플랫폼별 키워드/장르 빈도 + 급상승 트렌드 계산
 */
import type { Database } from 'sql.js';
import { getRecentRankingTitles, getAllNovels, getLatestTwoStats, getStatBefore } from '../db/queries';

// ── 타입 ──

export interface InfographicData {
  snapshotDate: string;
  byPlatform: Array<{
    platform: string;
    keywords: Array<{ text: string; count: number }>;
    genres: Array<{ text: string; count: number }>;
  }>;
  todayRising: Array<{ title: string; platform: string; surge: number }>;
  weekRising: Array<{ title: string; platform: string; surge: number }>;
  monthRising: Array<{ title: string; platform: string; surge: number }>;
}

// ── 한국어 조사/불용어 ──

const STOP_PARTICLES = new Set([
  '의', '을', '를', '이', '가', '은', '는', '에', '와', '과',
  '로', '으로', '에서', '한', '된', '하는', '그', '저', '이런',
  '그런', '저런', '더', '또', '및', '등', '중', '후', '전',
]);

// ── 헬퍼: 제목에서 키워드 추출 ──

function extractKeywords(title: string): string[] {
  if (!title) return [];
  // 한글/영문 2글자 이상 단어 추출
  const words = title.match(/[가-힣a-zA-Z]{2,}/g) || [];
  return words.filter((w) => !STOP_PARTICLES.has(w));
}

// ── 플랫폼 정규화 (간단 매핑) ──

function normPlatform(p: string | null | undefined): string {
  if (!p) return '미분류';
  if (p.includes('네이버')) return '네이버시리즈';
  if (p.includes('카카오')) return '카카오페이지';
  if (p.includes('문피아')) return '문피아';
  if (p.includes('리디')) return '리디';
  if (p.includes('노벨피아')) return '노벨피아';
  return p;
}

// ── 공개 함수 ──

/** DB에서 사용 가능한 인포그래픽 스냅샷 날짜 목록 */
export function getInfographicDates(db: Database): string[] {
  const stmt = db.prepare(
    'SELECT DISTINCT ranking_date FROM daily_rankings ORDER BY ranking_date DESC LIMIT 90',
  );
  const dates: string[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as { ranking_date: string };
    dates.push(row.ranking_date);
  }
  stmt.free();
  return dates;
}

/** 인포그래픽 데이터 빌드 */
export function buildInfographicData(db: Database, days = 30): InfographicData {
  const today = new Date().toISOString().slice(0, 10);

  // ─ 1. 플랫폼별 키워드 빈도 ─
  const rankingRows = getRecentRankingTitles(db, days);

  // 플랫폼별 키워드 카운트
  const platformKeywords = new Map<string, Map<string, number>>();
  // 플랫폼별 장르 카운트
  const platformGenres = new Map<string, Map<string, number>>();

  for (const row of rankingRows) {
    const platform = normPlatform(row.platform);

    // 키워드
    if (!platformKeywords.has(platform)) platformKeywords.set(platform, new Map());
    const kwMap = platformKeywords.get(platform)!;
    const words = extractKeywords(row.title);
    const seen = new Set<string>();
    for (const w of words) {
      if (seen.has(w)) continue;
      seen.add(w);
      kwMap.set(w, (kwMap.get(w) ?? 0) + 1);
    }

    // 장르 (랭킹 테이블의 genre 컬럼)
    if (row.genre) {
      if (!platformGenres.has(platform)) platformGenres.set(platform, new Map());
      const gMap = platformGenres.get(platform)!;
      gMap.set(row.genre, (gMap.get(row.genre) ?? 0) + 1);
    }
  }

  // management_novels의 장르도 보충
  const novels = getAllNovels(db);
  for (const novel of novels) {
    if (!novel.genre) continue;
    const platform = normPlatform(novel.platform);
    if (!platformGenres.has(platform)) platformGenres.set(platform, new Map());
    const gMap = platformGenres.get(platform)!;
    // 이미 랭킹에서 카운트한 것이 없으면 추가
    if (!gMap.has(novel.genre)) {
      gMap.set(novel.genre, 1);
    }
  }

  const PLATFORM_ORDER = ['네이버시리즈', '카카오페이지', '문피아', '리디', '노벨피아'];

  const byPlatform = PLATFORM_ORDER.map((platform) => {
    const kwMap = platformKeywords.get(platform) || new Map<string, number>();
    const gMap = platformGenres.get(platform) || new Map<string, number>();

    const keywords = [...kwMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([text, count]) => ({ text, count }));

    const genres = [...gMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([text, count]) => ({ text, count }));

    return { platform, keywords, genres };
  });

  // ─ 2. 급상승 트렌드 (daily/weekly/monthly) ─
  const todayRising: InfographicData['todayRising'] = [];
  const weekRising: InfographicData['weekRising'] = [];
  const monthRising: InfographicData['monthRising'] = [];

  const todayDate = new Date();
  const yesterdayDate = new Date(todayDate);
  yesterdayDate.setDate(todayDate.getDate() - 1);
  const weekAgoDate = new Date(todayDate);
  weekAgoDate.setDate(todayDate.getDate() - 7);
  const monthAgoDate = new Date(todayDate);
  monthAgoDate.setDate(todayDate.getDate() - 30);

  const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);
  const weekAgoStr = weekAgoDate.toISOString().slice(0, 10);
  const monthAgoStr = monthAgoDate.toISOString().slice(0, 10);

  for (const novel of novels) {
    if (!novel.id) continue;
    const platform = normPlatform(novel.platform);
    const latestTwo = getLatestTwoStats(db, novel.id);
    if (latestTwo.length < 2) continue;

    const current = latestTwo[0];
    const prev = latestTwo[1];
    const currentViews = current.views ?? 0;
    const prevViews = prev.views ?? 0;

    // 일간 급상승
    const dailySurge = currentViews - prevViews;
    if (dailySurge > 0) {
      todayRising.push({ title: novel.title, platform, surge: dailySurge });
    }

    // 주간 급상승
    const weekStat = getStatBefore(db, novel.id, weekAgoStr);
    if (weekStat) {
      const weekSurge = currentViews - (weekStat.views ?? 0);
      if (weekSurge > 0) {
        weekRising.push({ title: novel.title, platform, surge: weekSurge });
      }
    }

    // 월간 급상승
    const monthStat = getStatBefore(db, novel.id, monthAgoStr);
    if (monthStat) {
      const monthSurge = currentViews - (monthStat.views ?? 0);
      if (monthSurge > 0) {
        monthRising.push({ title: novel.title, platform, surge: monthSurge });
      }
    }
  }

  // 정렬 (surge 내림차순) & 슬라이싱
  todayRising.sort((a, b) => b.surge - a.surge);
  weekRising.sort((a, b) => b.surge - a.surge);
  monthRising.sort((a, b) => b.surge - a.surge);

  return {
    snapshotDate: today,
    byPlatform,
    todayRising: todayRising.slice(0, 20),
    weekRising: weekRising.slice(0, 20),
    monthRising: monthRising.slice(0, 20),
  };
}
