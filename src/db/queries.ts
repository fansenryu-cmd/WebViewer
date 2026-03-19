/**
 * 모든 SQL 쿼리 (타입 안전)
 */
import type { Database } from 'sql.js';
import type {
  ManagementNovel,
  DailyStatistics,
  DailyRanking,
} from './types';

/** 헬퍼: 쿼리 결과를 객체 배열로 변환 */
function queryAll<T>(db: Database, sql: string, params?: unknown[]): T[] {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const results: T[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return results;
}

/** 전체 소설 목록 */
export function getAllNovels(db: Database): ManagementNovel[] {
  return queryAll<ManagementNovel>(
    db,
    'SELECT * FROM management_novels ORDER BY created_at DESC',
  );
}

/** 소설 1건 */
export function getNovelById(db: Database, id: number): ManagementNovel | null {
  const rows = queryAll<ManagementNovel>(
    db,
    'SELECT * FROM management_novels WHERE id = ?',
    [id],
  );
  return rows[0] || null;
}

/** 소설별 일일 통계 */
export function getStatsByNovelId(db: Database, novelId: number): DailyStatistics[] {
  return queryAll<DailyStatistics>(
    db,
    'SELECT * FROM daily_statistics WHERE novel_id = ? ORDER BY date ASC',
    [novelId],
  );
}

/** 특정 날짜 랭킹 */
export function getRankingsByDate(db: Database, date: string): DailyRanking[] {
  return queryAll<DailyRanking>(
    db,
    'SELECT * FROM daily_rankings WHERE ranking_date = ? ORDER BY platform, rank',
    [date],
  );
}

/** 최근 랭킹 날짜 목록 */
export function getRecentRankingDates(db: Database, limit = 30): string[] {
  return queryAll<{ ranking_date: string }>(
    db,
    'SELECT DISTINCT ranking_date FROM daily_rankings ORDER BY ranking_date DESC LIMIT ?',
    [limit],
  ).map((r) => r.ranking_date);
}

/** 가장 최근 랭킹 날짜 */
export function getLatestRankingDate(db: Database): string | null {
  const rows = queryAll<{ ranking_date: string }>(
    db,
    'SELECT ranking_date FROM daily_rankings ORDER BY ranking_date DESC LIMIT 1',
  );
  return rows[0]?.ranking_date || null;
}

/** 소설의 최근 N개 통계 */
export function getRecentStats(
  db: Database,
  novelId: number,
  limit = 30,
): DailyStatistics[] {
  return queryAll<DailyStatistics>(
    db,
    'SELECT * FROM daily_statistics WHERE novel_id = ? ORDER BY date DESC LIMIT ?',
    [novelId, limit],
  );
}

/** 플랫폼별 소설 목록 (통합 통계용) */
export function getNovelsByPlatform(
  db: Database,
  platform: string,
): ManagementNovel[] {
  // 플랫폼명이 다양한 형태로 저장될 수 있으므로 LIKE 사용
  return queryAll<ManagementNovel>(
    db,
    'SELECT * FROM management_novels WHERE platform LIKE ?',
    [`%${platform}%`],
  );
}

/** 전체 일일 통계 (모든 소설) */
export function getAllStats(db: Database): DailyStatistics[] {
  return queryAll<DailyStatistics>(
    db,
    'SELECT * FROM daily_statistics ORDER BY novel_id, date ASC',
  );
}

/** 소설별 최신 통계 2개 (surge 계산용) */
export function getLatestTwoStats(
  db: Database,
  novelId: number,
): DailyStatistics[] {
  return queryAll<DailyStatistics>(
    db,
    'SELECT * FROM daily_statistics WHERE novel_id = ? ORDER BY date DESC LIMIT 2',
    [novelId],
  );
}

/** 특정 날짜 이전 가장 가까운 통계 */
export function getStatBefore(
  db: Database,
  novelId: number,
  beforeDate: string,
): DailyStatistics | null {
  const rows = queryAll<DailyStatistics>(
    db,
    'SELECT * FROM daily_statistics WHERE novel_id = ? AND date <= ? ORDER BY date DESC LIMIT 1',
    [novelId, beforeDate],
  );
  return rows[0] || null;
}

// ─── 신작 모니터링 쿼리 ───

/** 신작 모니터링용 ranking_type 목록 */
export const ROOKIE_MONITOR_RANKING_TYPES = [
  'rookie',
  'new_novel_today',
  'genre_heroism',
  'genre_fantasy',
  'genre_fusion',
  'genre_game',
  'genre_newfantasy',
  'genre_history',
] as const;

/** 신작 모니터링 데이터가 있는 최근 날짜 목록 */
export function getRecentRookieMonitorDates(db: Database, limit = 30): string[] {
  return queryAll<{ ranking_date: string }>(
    db,
    `SELECT DISTINCT ranking_date FROM daily_rankings
     WHERE ranking_type IN ('rookie','new_novel_today','genre_heroism','genre_fantasy','genre_fusion','genre_game','genre_newfantasy','genre_history')
     ORDER BY ranking_date DESC LIMIT ?`,
    [limit],
  ).map((r) => r.ranking_date);
}

/** 가장 최근 신작 모니터링 날짜 */
export function getLatestRookieMonitorDate(db: Database): string | null {
  const rows = queryAll<{ ranking_date: string }>(
    db,
    `SELECT ranking_date FROM daily_rankings
     WHERE ranking_type IN ('rookie','new_novel_today','genre_heroism','genre_fantasy','genre_fusion','genre_game','genre_newfantasy','genre_history')
     ORDER BY ranking_date DESC LIMIT 1`,
  );
  return rows[0]?.ranking_date || null;
}

/** 특정 날짜의 신작 모니터링 랭킹 전체 */
export function getRookieMonitorRankingsByDate(db: Database, date: string): DailyRanking[] {
  return queryAll<DailyRanking>(
    db,
    `SELECT * FROM daily_rankings
     WHERE ranking_date = ?
       AND ranking_type IN ('rookie','new_novel_today','genre_heroism','genre_fantasy','genre_fusion','genre_game','genre_newfantasy','genre_history')
     ORDER BY ranking_type, rank`,
    [date],
  );
}

/** 특정 소설의 특정 날짜 통계 */
export function getStatByDate(db: Database, novelId: number, date: string): DailyStatistics | null {
  const rows = queryAll<DailyStatistics>(
    db,
    'SELECT * FROM daily_statistics WHERE novel_id = ? AND date = ? LIMIT 1',
    [novelId, date],
  );
  return rows[0] || null;
}

// ─── 랭킹 변동 감지 쿼리 ───

/** 특정 날짜 직전의 랭킹 날짜 (이전 날짜) */
export function getPreviousRankingDate(db: Database, currentDate: string): string | null {
  const rows = queryAll<{ ranking_date: string }>(
    db,
    'SELECT DISTINCT ranking_date FROM daily_rankings WHERE ranking_date < ? ORDER BY ranking_date DESC LIMIT 1',
    [currentDate],
  );
  return rows[0]?.ranking_date || null;
}

// ─── 제목 패턴 분석용 쿼리 ───

/** 최근 N일 내 랭킹 제목 + 플랫폼 (중복 제거) */
export function getRecentRankingTitles(
  db: Database,
  days = 60,
): { title: string; platform: string; genre: string }[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return queryAll<{ title: string; platform: string; genre: string }>(
    db,
    `SELECT DISTINCT title, platform, genre FROM daily_rankings
     WHERE ranking_date >= ? AND ranking_type NOT IN ('rookie','new_novel_today','genre_heroism','genre_fantasy','genre_fusion','genre_game','genre_newfantasy','genre_history')
     ORDER BY title`,
    [cutoffStr],
  );
}

/** 장르 성장률 계산용: 최근 기간별 장르별 신규 등록 소설 수 */
export function getNovelCountByGenrePeriod(
  db: Database,
  startDate: string,
  endDate: string,
): { genre: string; cnt: number }[] {
  return queryAll<{ genre: string; cnt: number }>(
    db,
    `SELECT genre, COUNT(DISTINCT title) as cnt FROM daily_rankings
     WHERE ranking_date >= ? AND ranking_date <= ?
       AND genre IS NOT NULL AND genre != ''
       AND ranking_type NOT IN ('rookie','new_novel_today','genre_heroism','genre_fantasy','genre_fusion','genre_game','genre_newfantasy','genre_history')
     GROUP BY genre ORDER BY cnt DESC`,
    [startDate, endDate],
  );
}

// ─── 심화 분석(Deep Analysis) 쿼리 ───

/** 특정 소설의 일일 통계 (날짜 범위) */
export function getStatsByNovelIdSince(
  db: Database,
  novelId: number,
  sinceDate: string,
): Array<{ date: string; views: number }> {
  return queryAll<{ date: string; views: number }>(
    db,
    'SELECT date, views FROM daily_statistics WHERE novel_id = ? AND date >= ? ORDER BY date ASC',
    [novelId, sinceDate],
  );
}

/** 플랫폼별 전체 소설의 일일 통계 */
export function getAllStatsSince(
  db: Database,
  sinceDate: string,
  platform?: string,
): Array<{ novel_id: number; date: string; views: number }> {
  if (platform) {
    return queryAll<{ novel_id: number; date: string; views: number }>(
      db,
      `SELECT ds.novel_id, ds.date, ds.views
       FROM daily_statistics ds
       JOIN management_novels mn ON ds.novel_id = mn.id
       WHERE ds.date >= ? AND mn.platform LIKE ?
       ORDER BY ds.novel_id, ds.date ASC`,
      [sinceDate, `%${platform}%`],
    );
  }
  return queryAll<{ novel_id: number; date: string; views: number }>(
    db,
    `SELECT novel_id, date, views
     FROM daily_statistics
     WHERE date >= ?
     ORDER BY novel_id, date ASC`,
    [sinceDate],
  );
}

/** 랭킹 생존 분석용 데이터 */
export function getRankingAppearances(
  db: Database,
  sinceDate: string,
): Array<{ title: string; platform: string; genre: string; ranking_date: string }> {
  return queryAll<{ title: string; platform: string; genre: string; ranking_date: string }>(
    db,
    `SELECT title, platform, genre, ranking_date
     FROM daily_rankings
     WHERE ranking_date >= ?
       AND ranking_type NOT IN ('rookie','new_novel_today','genre_heroism','genre_fantasy','genre_fusion','genre_game','genre_newfantasy','genre_history')
     ORDER BY title, ranking_date ASC`,
    [sinceDate],
  );
}

/** 시장 집중도용 차원별 카운트 */
export function getConcentrationData(
  db: Database,
  dimension: 'publisher' | 'genre' | 'platform',
  sinceDate: string,
): Array<{ name: string; cnt: number }> {
  if (dimension === 'genre') {
    // 장르: ManagementNovel.genre + DailyRanking 교차 참조
    const rows = queryAll<{ name: string; cnt: number }>(
      db,
      `SELECT mn.genre AS name, COUNT(dr.id) AS cnt
       FROM management_novels mn
       JOIN daily_rankings dr ON mn.id = dr.novel_id
       WHERE dr.ranking_date >= ?
         AND mn.genre IS NOT NULL AND mn.genre != ''
       GROUP BY mn.genre
       ORDER BY cnt DESC`,
      [sinceDate],
    );
    if (rows.length > 0) return rows;
    // 폴백: ManagementNovel만
    return queryAll<{ name: string; cnt: number }>(
      db,
      `SELECT genre AS name, COUNT(id) AS cnt
       FROM management_novels
       WHERE genre IS NOT NULL AND genre != ''
       GROUP BY genre ORDER BY cnt DESC`,
    );
  }

  // publisher / platform: DailyRanking 기반
  const col = dimension === 'publisher' ? 'publisher' : 'platform';
  const rows = queryAll<{ name: string; cnt: number }>(
    db,
    `SELECT ${col} AS name, COUNT(id) AS cnt
     FROM daily_rankings
     WHERE ranking_date >= ?
       AND ${col} IS NOT NULL AND ${col} != '' AND ${col} != '알 수 없음'
     GROUP BY ${col}
     ORDER BY cnt DESC`,
    [sinceDate],
  );
  if (rows.length > 0) return rows;
  // 폴백: ManagementNovel
  return queryAll<{ name: string; cnt: number }>(
    db,
    `SELECT ${col} AS name, COUNT(id) AS cnt
     FROM management_novels
     WHERE ${col} IS NOT NULL AND ${col} != '' AND ${col} != '알 수 없음'
     GROUP BY ${col}
     ORDER BY cnt DESC`,
  );
}

/** TF-IDF용 플랫폼별 제목 */
export function getTitlesByPlatform(
  db: Database,
): Array<{ platform: string; title: string }> {
  // ManagementNovel 우선, DailyRanking 보충
  const mnRows = queryAll<{ platform: string; title: string }>(
    db,
    `SELECT platform, title FROM management_novels
     WHERE title IS NOT NULL AND title != ''`,
  );
  if (mnRows.length >= 5) return mnRows;

  const existing = new Set(mnRows.map((r) => r.title));
  const drRows = queryAll<{ platform: string; title: string }>(
    db,
    `SELECT DISTINCT platform, title FROM daily_rankings
     WHERE title IS NOT NULL AND title != ''
       AND ranking_type NOT IN ('rookie','new_novel_today','genre_heroism','genre_fantasy','genre_fusion','genre_game','genre_newfantasy','genre_history')`,
  );
  for (const r of drRows) {
    if (!existing.has(r.title)) {
      mnRows.push(r);
      existing.add(r.title);
    }
  }
  return mnRows;
}

/** 교차 분석용 작가-플랫폼 쌍 */
export function getAuthorPlatformPairs(
  db: Database,
  sinceDate: string,
): Array<{ author: string; platform: string }> {
  // DailyRanking 우선
  const rows = queryAll<{ author: string; platform: string }>(
    db,
    `SELECT DISTINCT author, platform FROM daily_rankings
     WHERE ranking_date >= ?
       AND author IS NOT NULL AND author != '' AND author != '알 수 없음'
       AND platform IS NOT NULL AND platform != ''`,
    [sinceDate],
  );
  if (rows.length > 0) return rows;
  // 폴백: ManagementNovel
  return queryAll<{ author: string; platform: string }>(
    db,
    `SELECT DISTINCT author, platform FROM management_novels
     WHERE author IS NOT NULL AND author != '' AND author != '알 수 없음'
       AND platform IS NOT NULL AND platform != ''`,
  );
}

/** 장르×플랫폼 히트맵 데이터 */
export function getGenrePlatformHeatmap(
  db: Database,
  sinceDate: string,
): Array<{ genre: string; platform: string; avg_views: number; count: number }> {
  const rows = queryAll<{ genre: string; platform: string; avg_views: number; count: number }>(
    db,
    `SELECT genre, platform, AVG(views) AS avg_views, COUNT(id) AS count
     FROM daily_rankings
     WHERE ranking_date >= ?
       AND genre IS NOT NULL AND genre != ''
       AND views IS NOT NULL
     GROUP BY genre, platform`,
    [sinceDate],
  );
  if (rows.length > 0) return rows;
  // 폴백: ManagementNovel (count만)
  return queryAll<{ genre: string; platform: string; avg_views: number; count: number }>(
    db,
    `SELECT genre, platform, COUNT(id) AS avg_views, COUNT(id) AS count
     FROM management_novels
     WHERE genre IS NOT NULL AND genre != ''
       AND platform IS NOT NULL AND platform != ''
     GROUP BY genre, platform`,
  );
}

/** 전환 퍼널용 문피아 소설 상세 데이터 */
export function getMunpiaDetailData(
  db: Database,
): Array<{ novel_id: number; title: string; date: string; views: number; detail_data: string }> {
  return queryAll<{ novel_id: number; title: string; date: string; views: number; detail_data: string }>(
    db,
    `SELECT mn.id AS novel_id, mn.title, ds.date, ds.views, ds.detail_data
     FROM management_novels mn
     JOIN daily_statistics ds ON mn.id = ds.novel_id
     WHERE mn.platform LIKE '%문피아%'
     ORDER BY mn.id, ds.date ASC`,
  );
}

// ─── 롱텀 분석 쿼리 ───

/** 롱텀: 랭킹 체류 분석용 데이터 (기간 내 전체 랭킹) */
export function getRankingDataSince(
  db: Database,
  sinceDate: string,
): Array<{ title: string; platform: string; ranking_date: string; rank: number; author: string; genre: string }> {
  return queryAll<{ title: string; platform: string; ranking_date: string; rank: number; author: string; genre: string }>(
    db,
    `SELECT title, platform, ranking_date, rank, COALESCE(author,'') as author, COALESCE(genre,'') as genre
     FROM daily_rankings
     WHERE ranking_date >= ?
       AND ranking_type NOT IN ('rookie','new_novel_today','genre_heroism','genre_fantasy','genre_fusion','genre_game','genre_newfantasy','genre_history')
     ORDER BY title, platform, ranking_date ASC`,
    [sinceDate],
  );
}

/** 롱텀: 월별 장르 카운트 */
export function getMonthlyGenreCounts(
  db: Database,
  sinceDate: string,
): Array<{ month: string; genre: string; cnt: number }> {
  return queryAll<{ month: string; genre: string; cnt: number }>(
    db,
    `SELECT strftime('%Y-%m', ranking_date) AS month, genre, COUNT(id) AS cnt
     FROM daily_rankings
     WHERE ranking_date >= ?
       AND genre IS NOT NULL AND genre != ''
       AND ranking_type NOT IN ('rookie','new_novel_today','genre_heroism','genre_fantasy','genre_fusion','genre_game','genre_newfantasy','genre_history')
     GROUP BY month, genre
     ORDER BY month ASC`,
    [sinceDate],
  );
}

/** 롱텀: 월별 출판사 카운트 */
export function getMonthlyPublisherCounts(
  db: Database,
  sinceDate: string,
): Array<{ month: string; publisher: string; cnt: number }> {
  return queryAll<{ month: string; publisher: string; cnt: number }>(
    db,
    `SELECT strftime('%Y-%m', ranking_date) AS month, publisher, COUNT(id) AS cnt
     FROM daily_rankings
     WHERE ranking_date >= ?
       AND publisher IS NOT NULL AND publisher != '' AND publisher != '알 수 없음'
       AND ranking_type NOT IN ('rookie','new_novel_today','genre_heroism','genre_fantasy','genre_fusion','genre_game','genre_newfantasy','genre_history')
     GROUP BY month, publisher
     ORDER BY month ASC`,
    [sinceDate],
  );
}

/** 롱텀: 작가 일별 작품 목록 */
export function getAuthorDailyTitles(
  db: Database,
  sinceDate: string,
): Array<{ author: string; ranking_date: string; title: string }> {
  return queryAll<{ author: string; ranking_date: string; title: string }>(
    db,
    `SELECT author, ranking_date, title
     FROM daily_rankings
     WHERE ranking_date >= ?
       AND author IS NOT NULL AND author != '' AND author != '알 수 없음'
       AND ranking_type NOT IN ('rookie','new_novel_today','genre_heroism','genre_fantasy','genre_fusion','genre_game','genre_newfantasy','genre_history')
     ORDER BY author, ranking_date ASC`,
    [sinceDate],
  );
}

/** 롱텀: 프로모션 분석용 일일 통계 */
export function getPromotionStats(
  db: Database,
  sinceDate: string,
): Array<{ novel_id: number; date: string; views: number; promotion_active: number; promotion_note: string; promotion_tags: string; title: string; platform: string }> {
  return queryAll<{ novel_id: number; date: string; views: number; promotion_active: number; promotion_note: string; promotion_tags: string; title: string; platform: string }>(
    db,
    `SELECT ds.novel_id, ds.date, ds.views,
            COALESCE(ds.promotion_active, 0) as promotion_active,
            COALESCE(ds.promotion_note, '') as promotion_note,
            COALESCE(ds.promotion_tags, '') as promotion_tags,
            mn.title, COALESCE(mn.platform, '') as platform
     FROM daily_statistics ds
     JOIN management_novels mn ON ds.novel_id = mn.id
     WHERE ds.date >= ? AND ds.views IS NOT NULL
     ORDER BY ds.novel_id, ds.date ASC`,
    [sinceDate],
  );
}

/** 롱텀: 요일별 랭킹 카운트 */
export function getDayOfWeekRankingCounts(
  db: Database,
  sinceDate: string,
): Array<{ dow: string; ranking_date: string; cnt: number }> {
  return queryAll<{ dow: string; ranking_date: string; cnt: number }>(
    db,
    `SELECT strftime('%w', ranking_date) AS dow, ranking_date, COUNT(id) AS cnt
     FROM daily_rankings
     WHERE ranking_date >= ?
       AND ranking_type NOT IN ('rookie','new_novel_today','genre_heroism','genre_fantasy','genre_fusion','genre_game','genre_newfantasy','genre_history')
     GROUP BY dow, ranking_date`,
    [sinceDate],
  );
}

/** 롱텀: 월별 조회수 볼륨 */
export function getMonthlyViewsVolume(
  db: Database,
  sinceDate: string,
): Array<{ month: string; total_views: number; novel_count: number; entry_count: number }> {
  return queryAll<{ month: string; total_views: number; novel_count: number; entry_count: number }>(
    db,
    `SELECT strftime('%Y-%m', date) AS month,
            SUM(views) AS total_views,
            COUNT(DISTINCT novel_id) AS novel_count,
            COUNT(id) AS entry_count
     FROM daily_statistics
     WHERE date >= ?
     GROUP BY month
     ORDER BY month ASC`,
    [sinceDate],
  );
}

/** 롱텀: 월별 랭킹 진입 작품수 */
export function getMonthlyRankingCounts(
  db: Database,
  sinceDate: string,
): Array<{ month: string; unique_titles: number; total_entries: number }> {
  return queryAll<{ month: string; unique_titles: number; total_entries: number }>(
    db,
    `SELECT strftime('%Y-%m', ranking_date) AS month,
            COUNT(DISTINCT title) AS unique_titles,
            COUNT(id) AS total_entries
     FROM daily_rankings
     WHERE ranking_date >= ?
       AND ranking_type NOT IN ('rookie','new_novel_today','genre_heroism','genre_fantasy','genre_fusion','genre_game','genre_newfantasy','genre_history')
     GROUP BY month
     ORDER BY month ASC`,
    [sinceDate],
  );
}

/** 롱텀: 키워드 트렌드용 월별 제목+순위 */
export function getMonthlyTitlesWithRank(
  db: Database,
  sinceDate: string,
): Array<{ month: string; title: string; rank: number }> {
  return queryAll<{ month: string; title: string; rank: number }>(
    db,
    `SELECT strftime('%Y-%m', ranking_date) AS month, title, rank
     FROM daily_rankings
     WHERE ranking_date >= ?
       AND title IS NOT NULL AND title != ''
       AND ranking_type NOT IN ('rookie','new_novel_today','genre_heroism','genre_fantasy','genre_fusion','genre_game','genre_newfantasy','genre_history')`,
    [sinceDate],
  );
}

/** 소설ID→장르 매핑 (ManagementNovel.genre 우선, DailyRanking.genre 보충) */
export function getNovelGenreMap(db: Database): Map<number, string> {
  const map = new Map<number, string>();
  // ManagementNovel.genre 우선
  const mnRows = queryAll<{ id: number; genre: string }>(
    db,
    `SELECT id, genre FROM management_novels
     WHERE genre IS NOT NULL AND genre != ''`,
  );
  for (const r of mnRows) {
    map.set(r.id, r.genre);
  }
  // DailyRanking.genre 보충 (novel_id가 있고 ManagementNovel에 장르가 없는 경우)
  const drRows = queryAll<{ novel_id: number; genre: string }>(
    db,
    `SELECT DISTINCT novel_id, genre FROM daily_rankings
     WHERE novel_id IS NOT NULL AND genre IS NOT NULL AND genre != ''`,
  );
  for (const r of drRows) {
    if (r.novel_id && !map.has(r.novel_id)) {
      map.set(r.novel_id, r.genre);
    }
  }
  return map;
}
