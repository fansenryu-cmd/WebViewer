/**
 * SQLite DB 로더 — Dropbox 공유 링크 → sql.js 초기화
 *
 * Dropbox ?dl=1 링크를 통해 SQLite DB 파일을 다운로드하고
 * sql.js (WebAssembly)를 사용해 브라우저 메모리에서 쿼리합니다.
 * (URL 저장소는 db/urlStorage.ts — 앱 초기 로딩 시 sql.js 로드를 지연하기 위해 분리)
 */
import type { Database } from 'sql.js';
import { setDbUrl, setLastLoadTime } from './urlStorage';

/** sql.js 초기화 함수를 동적 import로 가져온다 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getInitSqlJs(): Promise<any> {
  const mod = await import('sql.js');
  return (mod as any).default ?? mod;
}

/** WASM 파일 URL — public/sql-wasm.wasm (Vite가 빌드 시 dist/ 루트에 복사) */
function getWasmUrl(): string {
  const base = import.meta.env.BASE_URL ?? './';
  return `${base}sql-wasm.wasm`;
}

/** Dropbox URL을 다운로드용으로 변환 (공유 링크 → 직접 다운로드) */
function toDirectDownloadUrl(url: string): string {
  // ?dl=0 → ?dl=1, &dl=0 → &dl=1 (구분자 유지해야 쿼리 문자열 안 깨짐)
  let u = url.replace(/([?&])dl=0/, '$1dl=1');
  if (!u.includes('dl=1')) {
    u += (u.includes('?') ? '&' : '?') + 'dl=1';
  }
  return u;
}

/** sql.js WASM 초기화 + DB 로드 */
export async function loadDatabase(
  dropboxUrl: string,
  onProgress?: (stage: string) => void,
): Promise<Database> {
  onProgress?.('sql.js 엔진 초기화 중...');

  const initSqlJs = await getInitSqlJs();
  const SQL = await initSqlJs({ locateFile: () => getWasmUrl() });

  onProgress?.('DB 파일 다운로드 중...');

  const directUrl = toDirectDownloadUrl(dropboxUrl);
  const response = await fetch(directUrl);

  if (!response.ok) {
    throw new Error(`DB 다운로드 실패: ${response.status} ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  const size = (buffer.byteLength / 1024 / 1024).toFixed(1);
  onProgress?.(`DB 로드 완료 (${size} MB)`);

  const db = new SQL.Database(new Uint8Array(buffer));

  // DB 유효성 간단 검증
  try {
    const result = db.exec("SELECT COUNT(*) FROM management_novels");
    const count = result[0]?.values[0]?.[0] ?? 0;
    onProgress?.(`소설 ${count}개 로드됨`);
  } catch {
    throw new Error('유효한 NovelForge DB 파일이 아닙니다.');
  }

  setLastLoadTime();
  return db;
}

/** 로컬 파일에서 DB 로드 (다운받은 .db 파일 선택 → 브라우저 메모리에서 열기) */
export async function loadDatabaseFromFile(
  file: File,
  onProgress?: (stage: string) => void,
): Promise<Database> {
  onProgress?.('sql.js 엔진 초기화 중...');

  const initSqlJs = await getInitSqlJs();
  const SQL = await initSqlJs({ locateFile: () => getWasmUrl() });

  onProgress?.('파일 읽는 중...');
  const buffer = await file.arrayBuffer();
  const size = (buffer.byteLength / 1024 / 1024).toFixed(1);
  onProgress?.(`DB 로드 완료 (${size} MB)`);

  const db = new SQL.Database(new Uint8Array(buffer));

  try {
    const result = db.exec("SELECT COUNT(*) FROM management_novels");
    const count = result[0]?.values[0]?.[0] ?? 0;
    onProgress?.(`소설 ${count}개 로드됨`);
  } catch {
    throw new Error('유효한 NovelForge DB 파일이 아닙니다.');
  }

  setLastLoadTime();
  return db;
}

// getDbUrl, setDbUrl, getLastLoadTime → db/urlStorage.ts
export { getDbUrl, setDbUrl, getLastLoadTime } from './urlStorage';
