/**
 * DB 스키마 타입 정의 (backend/database.py 매핑)
 */

export interface ManagementNovel {
  id: number;
  title: string;
  author: string;
  publisher: string;
  platform: string;
  genre: string;
  keywords: string; // JSON string
  launch_date: string | null; // YYYY-MM-DD
  novel_url: string;
  created_at: string;
  updated_at: string;
}

export interface DailyStatistics {
  id: number;
  novel_id: number;
  date: string; // YYYY-MM-DD
  views: number; // Float, cumulative
  revenue: number;
  promotion_active: number; // 0 or 1
  promotion_note: string;
  detail_data: string; // JSON
  promotion_tags: string; // JSON array
}

export interface DailyRanking {
  id: number;
  ranking_date: string; // YYYY-MM-DD
  platform: string;
  ranking_type: string; // daily, free, paid, genre
  rank: number;
  title: string;
  author: string;
  publisher: string;
  views: number | null;
  novel_id: number | null;
  novel_url: string;
  genre: string;
  extra_data: string; // JSON
}

/** 소설 시리즈 데이터 포인트 */
export interface SeriesPoint {
  daysSinceLaunch: number;
  cumulativeViews: number;
}

/** Surge 데이터 */
export interface SurgeItem {
  novel_id: number | null;
  title: string;
  platform: string;
  views: number;
  surge: number;
  surge_rate: number;
  author?: string;
}

/** 플랫폼별 통합 통계 */
export interface PlatformAggregate {
  top20: SeriesPoint[];
  top40?: SeriesPoint[];
  top60?: SeriesPoint[];
  top80?: SeriesPoint[];
  myNovel?: SeriesPoint[];
  percentileTop?: number;
  totalNovels: number;
}
