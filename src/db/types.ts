/**
 * DB 타입 정의 — backend/database.py ManagementNovel, DailyStatistics, DailyRanking 미러링
 */

export interface ManagementNovel {
  id: number;
  title: string;
  author: string;
  publisher: string | null;
  platform: string | null;
  genre: string | null;
  keywords: string | null; // JSON array string
  launch_date: string | null; // YYYY-MM-DD
  novel_url: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface DailyStatistics {
  id: number;
  novel_id: number;
  date: string; // YYYY-MM-DD
  views: number; // FLOAT — 누적 조회수
  revenue: number | null;
  promotion_active: boolean;
  promotion_note: string | null;
  detail_data: string | null; // JSON string
  period_type: string; // "DAILY"
  is_estimated: number; // 0 or 1
  promotion_tags: string | null; // JSON array string
  created_at: string | null;
}

export interface DailyRanking {
  id: number;
  ranking_date: string; // YYYY-MM-DD
  platform: string;
  ranking_type: string; // "daily" | "free" | "paid" | "genre"
  rank: number;
  title: string;
  author: string;
  publisher: string | null;
  views: number | null;
  novel_id: number | null;
  novel_url: string | null;
  genre: string | null;
  extra_data: string | null; // JSON string
}

/** 파싱된 detail_data (문피아 연독률 등) */
export interface DetailData {
  avg_read_through_rate?: number;
  episode_details?: Record<string, unknown>;
  [key: string]: unknown;
}

/** 시계열 데이터 포인트 */
export interface SeriesPoint {
  daysSinceLaunch: number;
  cumulativeViews: number;
}

/** Surge 분석 결과 */
export interface SurgeItem {
  novel_id: number;
  title: string;
  author: string;
  platform: string;
  latest_views: number;
  previous_views: number;
  surge: number;
  surge_rate: number;
}

/** 퍼센타일 통계 결과 */
export interface PercentileData {
  top20: SeriesPoint[];
  top40: SeriesPoint[];
  top60: SeriesPoint[];
  top80: SeriesPoint[];
  myNovel: SeriesPoint[];
  percentileTop: number;
  totalNovels: number;
  myNovelTitle?: string;
}
