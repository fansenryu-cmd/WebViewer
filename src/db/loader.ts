/**
 * DB 로더 — Dropbox / Google Drive / 로컬 파일 → sql.js 초기화
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

/** 기존 DB 인스턴스 닫기 */
function closeExisting() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

// ── Dropbox ──

/** Dropbox 공유 URL을 다운로드 URL로 변환 */
function toDropboxDl(url: string): string {
  let dlUrl = url.replace(/[?&]dl=0/, '?dl=1');
  if (!dlUrl.includes('dl=1')) {
    dlUrl += (dlUrl.includes('?') ? '&' : '?') + 'dl=1';
  }
  return dlUrl;
}

function isDropboxFolderLink(url: string): boolean {
  return url.includes('/sh/') || url.includes('/scl/fo/');
}

/** Dropbox에서 DB 파일 다운로드 후 sql.js DB 인스턴스 생성 */
export async function loadDbFromDropbox(
  dropboxUrl: string,
  apiBaseUrl?: string,
): Promise<Database> {
  closeExisting();
  const SQL = await initSql();

  let buffer: ArrayBuffer;

  if (apiBaseUrl && isDropboxFolderLink(dropboxUrl)) {
    const resp = await fetch(
      `${apiBaseUrl}/api/web-viewer/dropbox-latest?folder_url=${encodeURIComponent(dropboxUrl)}`,
    );
    if (!resp.ok) throw new Error(`백엔드 API 오류: ${resp.status}`);
    buffer = await resp.arrayBuffer();
  } else {
    const dlUrl = toDropboxDl(dropboxUrl);
    const resp = await fetch(dlUrl);
    if (!resp.ok) throw new Error(`DB 다운로드 실패: ${resp.status}`);
    buffer = await resp.arrayBuffer();
  }

  dbInstance = new SQL.Database(new Uint8Array(buffer));
  return dbInstance;
}

// ── Google Drive ──

/** Google Drive API로 폴더 내 최신 DB 파일 다운로드 */
export async function loadDbFromGoogleDrive(
  folderId: string,
  apiKey: string,
): Promise<{ db: Database; fileName: string }> {
  closeExisting();
  const SQL = await initSql();

  // 1) 폴더 내 파일 목록 조회 (novelforge_*.db 패턴, 이름 역순 = 최신순)
  const listUrl = `https://www.googleapis.com/drive/v3/files?` +
    `q='${folderId}'+in+parents+and+name+contains+'novelforge'&` +
    `orderBy=name+desc&` +
    `fields=files(id,name,size,modifiedTime)&` +
    `pageSize=5&` +
    `key=${apiKey}`;

  const listResp = await fetch(listUrl);
  if (!listResp.ok) {
    const err = await listResp.json().catch(() => ({}));
    throw new Error(
      `Google Drive 파일 목록 조회 실패 (${listResp.status}): ${(err as Record<string, unknown>).error?.toString() || '권한 없음 — 폴더를 "링크가 있는 모든 사용자"로 공유해주세요'}`
    );
  }

  const listData = await listResp.json() as { files?: Array<{ id: string; name: string }> };
  const files = listData.files || [];
  if (files.length === 0) {
    throw new Error('Google Drive 폴더에 novelforge DB 파일이 없습니다.');
  }

  // 2) 최신 파일 다운로드
  const latest = files[0];
  const dlUrl = `https://www.googleapis.com/drive/v3/files/${latest.id}?alt=media&key=${apiKey}`;
  const dlResp = await fetch(dlUrl);
  if (!dlResp.ok) {
    throw new Error(`Google Drive DB 다운로드 실패 (${dlResp.status})`);
  }

  const buffer = await dlResp.arrayBuffer();
  dbInstance = new SQL.Database(new Uint8Array(buffer));
  return { db: dbInstance, fileName: latest.name };
}

// ── 로컬 파일 ──

/** 로컬 File 객체에서 DB 로드 */
export async function loadDbFromFile(file: File): Promise<Database> {
  closeExisting();
  const SQL = await initSql();
  const buffer = await file.arrayBuffer();
  dbInstance = new SQL.Database(new Uint8Array(buffer));
  return dbInstance;
}

/** 현재 DB 인스턴스 반환 */
export function getDb(): Database | null {
  return dbInstance;
}
