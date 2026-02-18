/**
 * SQL 쿼리 레이어 — sql.js Database를 사용한 타입 안전 쿼리
 *
 * backend/routers/management/ 의 SQLAlchemy 쿼리를 sql.js용 SQL로 포팅.
 */
import type { Database } from 'sql.js';
import type { ManagementNovel, DailyStatistics, DailyRanking } from './types';

/** 제네릭 쿼리 헬퍼 — sql.js 결과를 타입된 배열로 변환 */
function queryAll<T>(db: Database, sql: string, params: unknown[] = []): T[] {
  const stmt = db.prepare(sql);
  stmt.bind(params as (string | number | null)[]);
  const results: T[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return results;
}

function queryOne<T>(db: Database, sql: string, params: unknown[] = []): T | null {
  const rows = queryAll<T>(db, sql, params);
  return rows[0] ?? null;
}

// ==================== 소설 ====================

/** 전체 소설 목록 */
export function getAllNovels(db: Database): ManagementNovel[] {
  return queryAll<ManagementNovel>(
    db,
    `SELECT * FROM management_novels ORDER BY created_at DESC`,
  );
}

/** 소설 ID로 조회 */
export function getNovelById(db: Database, id: number): ManagementNovel | null {
  return queryOne<ManagementNovel>(
    db,
    `SELECT * FROM management_novels WHERE id = ?`,
    [id],
  );
}

/** 플랫폼별 소설 수 */
export function getNovelCountByPlatform(db: Database): Record<string, number> {
  const rows = queryAll<{ platform: string; count: number }>(
    db,
    `SELECT COALESCE(platform, '기타') as platform, COUNT(*) as count
     FROM management_novels GROUP BY platform`,
  );
  const result: Record<string, number> = {};
  for (const r of rows) {
    result[r.platform || '기타'] = r.count;
  }
  return result;
}

/** 플랫폼별 소설 목록 (플랫폼명 그룹) */
export function getNovelsByPlatform(db: Database): Record<string, ManagementNovel[]> {
  const novels = getAllNovels(db);
  const grouped: Record<string, ManagementNovel[]> = {};
  const ORDER = ['네이버시리즈', '카카오페이지', '리디북스', '리디', '문피아', '노벨피아'];
  for (const p of ORDER) {
    grouped[p] = [];
  }
  for (const n of novels) {
    const platform = n.platform?.trim() || '기타';
    if (!grouped[platform]) {
      grouped[platform] = [];
    }
    grouped[platform].push(n);
  }
  return grouped;
}

// ==================== 일일 통계 ====================

/** 소설별 일일 통계 (전체 기간) */
export function getDailyStats(db: Database, novelId: number): DailyStatistics[] {
  return queryAll<DailyStatistics>(
    db,
    `SELECT * FROM daily_statistics WHERE novel_id = ? ORDER BY date ASC`,
    [novelId],
  );
}

/** 소설별 최신 통계 N개 */
export function getLatestStats(db: Database, novelId: number, limit: number = 2): DailyStatistics[] {
  return queryAll<DailyStatistics>(
    db,
    `SELECT * FROM daily_statistics WHERE novel_id = ? ORDER BY date DESC LIMIT ?`,
    [novelId, limit],
  );
}

/** 특정 날짜의 통계 */
export function getStatByDate(db: Database, novelId: number, dateStr: string): DailyStatistics | null {
  return queryOne<DailyStatistics>(
    db,
    `SELECT * FROM daily_statistics WHERE novel_id = ? AND date = ?`,
    [novelId, dateStr],
  );
}

/** 특정 날짜 이전 가장 가까운 통계 (일간 범위 내) */
export function getStatBeforeDate(
  db: Database,
  novelId: number,
  dateStr: string,
  minDaysAgo: number,
  maxDaysAgo: number,
): DailyStatistics | null {
  const modifierLo = `-${maxDaysAgo} days`;
  const modifierHi = `-${minDaysAgo} days`;
  return queryOne<DailyStatistics>(
    db,
    `SELECT * FROM daily_statistics
     WHERE novel_id = ? AND date >= date(?, ?) AND date <= date(?, ?)
     ORDER BY date DESC LIMIT 1`,
    [novelId, dateStr, modifierLo, dateStr, modifierHi],
  );
}

/** 오늘 데이터가 있는 소설 수 */
export function countNovelsWithDataOnDate(db: Database, dateStr: string): number {
  const row = queryOne<{ cnt: number }>(
    db,
    `SELECT COUNT(DISTINCT novel_id) as cnt FROM daily_statistics WHERE date = ?`,
    [dateStr],
  );
  return row?.cnt ?? 0;
}

// ==================== 랭킹 ====================

/** 특정 날짜 랭킹 (플랫폼별 정렬) */
export function getRankingsByDate(db: Database, dateStr: string): DailyRanking[] {
  return queryAll<DailyRanking>(
    db,
    `SELECT * FROM daily_rankings WHERE ranking_date = ? ORDER BY platform, rank`,
    [dateStr],
  );
}

/** 특정 날짜 + 플랫폼 랭킹 (상위 N개) */
export function getRankingsByDateAndPlatform(
  db: Database,
  dateStr: string,
  platform: string,
  limit: number = 10,
): DailyRanking[] {
  return queryAll<DailyRanking>(
    db,
    `SELECT * FROM daily_rankings
     WHERE ranking_date = ? AND platform = ?
     ORDER BY rank LIMIT ?`,
    [dateStr, platform, limit],
  );
}

/** 랭킹 데이터가 있는 날짜 목록 (최근순, N개) */
export function getAvailableRankingDates(db: Database, limit: number = 60): string[] {
  const rows = queryAll<{ ranking_date: string }>(
    db,
    `SELECT DISTINCT ranking_date FROM daily_rankings ORDER BY ranking_date DESC LIMIT ?`,
    [limit],
  );
  return rows.map((r) => r.ranking_date);
}

/** 특정 날짜에 랭킹이 있는 플랫폼 목록 */
export function getRankingPlatformsOnDate(db: Database, dateStr: string): string[] {
  const rows = queryAll<{ platform: string }>(
    db,
    `SELECT DISTINCT platform FROM daily_rankings WHERE ranking_date = ? ORDER BY platform`,
    [dateStr],
  );
  return rows.map((r) => r.platform).filter(Boolean);
}

/** 최신 랭킹 날짜 */
export function getLatestRankingDate(db: Database): string | null {
  const row = queryOne<{ ranking_date: string }>(
    db,
    `SELECT MAX(ranking_date) as ranking_date FROM daily_rankings`,
  );
  return row?.ranking_date ?? null;
}

// ==================== 통합 통계용 ====================

/** launch_date가 있는 모든 소설 */
export function getNovelsWithLaunchDate(db: Database): ManagementNovel[] {
  return queryAll<ManagementNovel>(
    db,
    `SELECT * FROM management_novels WHERE launch_date IS NOT NULL`,
  );
}

/** 모든 일일 통계 (novel_id, date, views) — 통합 통계 계산용 */
export function getAllStatsForAggregate(db: Database): Array<{ novel_id: number; date: string; views: number }> {
  return queryAll<{ novel_id: number; date: string; views: number }>(
    db,
    `SELECT ds.novel_id, ds.date, ds.views
     FROM daily_statistics ds
     JOIN management_novels mn ON mn.id = ds.novel_id
     WHERE mn.launch_date IS NOT NULL
     ORDER BY ds.novel_id, ds.date`,
  );
}

// ==================== 아카이브의 정령 RAG용 ====================

/** 소설 요약 (RAG 컨텍스트용) */
export function getNovelsSummaryForRAG(db: Database, limit: number = 100): ManagementNovel[] {
  return queryAll<ManagementNovel>(
    db,
    `SELECT * FROM management_novels ORDER BY created_at DESC LIMIT ?`,
    [limit],
  );
}

/** 최근 N일 성장률 (RAG 컨텍스트용) */
export function getRecentGrowthForRAG(
  db: Database,
  recentDate: string,
  daysAgo: number = 30,
): Array<{ novel_id: number; title: string; platform: string; recent_views: number; old_views: number }> {
  const oldDateMod = `-${daysAgo} days`;
  return queryAll(
    db,
    `SELECT
       mn.id as novel_id,
       mn.title,
       COALESCE(mn.platform, '기타') as platform,
       ds_recent.views as recent_views,
       ds_old.views as old_views
     FROM management_novels mn
     JOIN daily_statistics ds_recent ON ds_recent.novel_id = mn.id
       AND ds_recent.date = (SELECT MAX(date) FROM daily_statistics WHERE novel_id = mn.id AND date <= ?)
     LEFT JOIN daily_statistics ds_old ON ds_old.novel_id = mn.id
       AND ds_old.date = (SELECT MAX(date) FROM daily_statistics WHERE novel_id = mn.id AND date <= date(?, ?))
     WHERE ds_recent.views IS NOT NULL
     ORDER BY (ds_recent.views - COALESCE(ds_old.views, 0)) DESC
     LIMIT 20`,
    [recentDate, recentDate, oldDateMod],
  );
}

/** 최근 랭킹 (RAG 컨텍스트용) */
export function getRecentRankingsForRAG(db: Database, limit: number = 50): DailyRanking[] {
  return queryAll<DailyRanking>(
    db,
    `SELECT * FROM daily_rankings
     WHERE ranking_date = (SELECT MAX(ranking_date) FROM daily_rankings)
     ORDER BY platform, rank
     LIMIT ?`,
    [limit],
  );
}
