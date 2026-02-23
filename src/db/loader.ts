/**
 * Dropbox URL → fetch → sql.js 초기화
 */
import initSqlJs, { type Database } from 'sql.js';

let dbInstance: Database | null = null;

/** sql.js WASM을 CDN에서 로드 */
async function initSql() {
  const SQL = await initSqlJs({
    locateFile: (file: string) =>
      `https://sql.js.org/dist/${file}`,
  });
  return SQL;
}

/** Dropbox 공유 URL을 다운로드 URL로 변환 */
function toDropboxDl(url: string): string {
  // https://www.dropbox.com/s/xxx/file.db?dl=0 → dl=1
  let dlUrl = url.replace(/[?&]dl=0/, '?dl=1');
  if (!dlUrl.includes('dl=1')) {
    dlUrl += (dlUrl.includes('?') ? '&' : '?') + 'dl=1';
  }
  return dlUrl;
}

/** Dropbox에서 DB 파일 다운로드 후 sql.js DB 인스턴스 생성 */
export async function loadDbFromDropbox(
  dropboxUrl: string,
  apiBaseUrl?: string,
): Promise<Database> {
  // 기존 DB 닫기
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }

  const SQL = await initSql();

  let buffer: ArrayBuffer;

  // Dropbox 폴더 링크인 경우 백엔드 API 사용
  if (apiBaseUrl && isDropboxFolderLink(dropboxUrl)) {
    const resp = await fetch(
      `${apiBaseUrl}/api/web-viewer/dropbox-latest?folder_url=${encodeURIComponent(dropboxUrl)}`,
    );
    if (!resp.ok) throw new Error(`백엔드 API 오류: ${resp.status}`);
    buffer = await resp.arrayBuffer();
  } else {
    // 단일 파일 Dropbox 링크
    const dlUrl = toDropboxDl(dropboxUrl);
    const resp = await fetch(dlUrl);
    if (!resp.ok) throw new Error(`DB 다운로드 실패: ${resp.status}`);
    buffer = await resp.arrayBuffer();
  }

  dbInstance = new SQL.Database(new Uint8Array(buffer));
  return dbInstance;
}

/** 로컬 File 객체에서 DB 로드 (디버그/개발용) */
export async function loadDbFromFile(file: File): Promise<Database> {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }

  const SQL = await initSql();
  const buffer = await file.arrayBuffer();
  dbInstance = new SQL.Database(new Uint8Array(buffer));
  return dbInstance;
}

/** 현재 DB 인스턴스 반환 */
export function getDb(): Database | null {
  return dbInstance;
}

function isDropboxFolderLink(url: string): boolean {
  return url.includes('/sh/') || url.includes('/scl/fo/');
}
