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
