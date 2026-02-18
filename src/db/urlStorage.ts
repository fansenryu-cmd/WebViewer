/**
 * DB URL 저장소 — localStorage만 사용 (sql.js 로드 없음)
 * 앱 초기 로딩 시 이 파일만 사용해 sql.js 로드를 지연합니다.
 */
const DB_URL_KEY = 'novelforge_db_url';
const DB_CACHE_KEY = 'novelforge_db_cache_time';

export function getDbUrl(): string | null {
  return localStorage.getItem(DB_URL_KEY);
}

export function setDbUrl(url: string): void {
  localStorage.setItem(DB_URL_KEY, url);
}

export function getLastLoadTime(): string | null {
  return localStorage.getItem(DB_CACHE_KEY);
}

export function setLastLoadTime(): void {
  localStorage.setItem(DB_CACHE_KEY, new Date().toISOString());
}
