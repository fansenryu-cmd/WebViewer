/**
 * 초기 화면 — DB 로드 (로컬 파일 선택 또는 Dropbox 링크)
 * sql.js는 로드 시에만 동적 로드해 앱 첫 화면이 멈추지 않도록 함.
 * Dropbox 폴더 링크인 경우 NovelForge 백엔드 API로 최신 novelforge_YYYYMMDD.db 자동 선택.
 */
import React, { useState, useEffect, useRef } from 'react';
import { getDbUrl, setDbUrl } from '../db/urlStorage';
import { useDb } from '../context/DbContext';

/** 기본 Dropbox 백업 폴더 링크 (novelforge_YYYYMMDD.db가 백업되는 곳) */
const DEFAULT_DROPBOX_FOLDER_URL =
  'https://www.dropbox.com/scl/fo/1hkzsi5dgt6hbx9w117nt/AM4L2U-AYhn5mFkkYbaaAE0?rlkey=bbts8md08lebqb9zohbr5l73i&st=8qy3z4nv&dl=0';

/** 폴더 공유 링크인지 판별 (scl/fo/ 또는 /fo/ 포함, 또는 .db로 안 끝남) */
function isDropboxFolderLink(link: string): boolean {
  const u = link.toLowerCase();
  return (u.includes('scl/fo/') || u.includes('/fo/')) && !u.includes('.db?') && !/\.db\s*$/i.test(link.trim());
}

/** NovelForge 백엔드 주소 (빌드 시 VITE_API_URL, 없으면 동일 오리진) */
function getApiBaseUrl(): string {
  const env = (import.meta.env?.VITE_API_URL as string) || '';
  if (env) return env.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return '';
}

export function InitScreen() {
  const { setDb, setIsLoading, setError, isLoading, error } = useDb();
  const initialUrl = getDbUrl() || DEFAULT_DROPBOX_FOLDER_URL;
  const [url, setUrl] = useState(initialUrl);
  const [progress, setProgress] = useState('');
  const autoLoadDone = useRef(false);

  // 폴더 링크 + 백엔드 있으면 가장 최신 날짜(파일명) DB 자동 로드 (최초 1회)
  useEffect(() => {
    if (autoLoadDone.current) return;
    const trimmed = initialUrl.trim();
    if (!trimmed || !isDropboxFolderLink(trimmed) || !getApiBaseUrl()) return;
    autoLoadDone.current = true;
    (async () => {
      setIsLoading(true);
      setError(null);
      setProgress('');
      try {
        const { loadDatabaseFromDropboxFolder } = await import('../db/loader');
        const database = await loadDatabaseFromDropboxFolder(getApiBaseUrl(), trimmed, (stage) => setProgress(stage));
        setDb(database);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'DB 자동 로드 실패');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [initialUrl]);

  const handleLoadFromUrlInternal = async (trimmed: string) => {
    setIsLoading(true);
    setError(null);
    setProgress('');
    try {
      if (isDropboxFolderLink(trimmed)) {
        const apiBase = getApiBaseUrl();
        if (apiBase) {
          const { loadDatabaseFromDropboxFolder } = await import('../db/loader');
          const database = await loadDatabaseFromDropboxFolder(apiBase, trimmed, (stage) => setProgress(stage));
          setDb(database);
        } else {
          setError(
            '폴더에서 최신 DB를 불러오려면 NovelForge 백엔드를 실행한 뒤, 같은 주소에서 웹 뷰어를 열거나 VITE_API_URL을 설정해 주세요. 또는 폴더를 열어 최신 novelforge_YYYYMMDD.db 파일 링크를 복사해 붙여넣어 주세요.',
          );
        }
        return;
      }
      const { loadDatabase } = await import('../db/loader');
      const database = await loadDatabase(trimmed, (stage) => setProgress(stage));
      setDbUrl(trimmed);
      setDb(database);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'DB 로드 실패');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadFromUrl = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setError('Dropbox 공유 링크를 입력해주세요.');
      return;
    }
    if (!trimmed.includes('dropbox.com')) {
      setError('Dropbox 공유 링크 형식이 아닙니다.');
      return;
    }
    await handleLoadFromUrlInternal(trimmed);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    setError(null);
    setProgress('');
    try {
      const { loadDatabaseFromFile } = await import('../db/loader');
      const database = await loadDatabaseFromFile(file, (stage) => setProgress(stage));
      setDb(database);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'DB 로드 실패');
    } finally {
      setIsLoading(false);
    }
    e.target.value = '';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">📚 NovelForge Viewer</h1>
        <p className="text-sm text-gray-600 mb-6">
          NovelForge DB 파일을 로컬에서 선택하거나, Dropbox 링크로 불러오세요.
        </p>

        {/* 로컬 파일 선택 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">로컬 파일</label>
          <input
            type="file"
            accept=".db,.sqlite,.sqlite3"
            onChange={handleFileSelect}
            disabled={isLoading}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:font-medium hover:file:bg-blue-100 disabled:opacity-50"
          />
          <p className="mt-1 text-xs text-gray-500">.db 파일을 다운받은 뒤 여기서 선택하세요.</p>
        </div>

        <div className="relative my-4">
          <span className="block text-center text-sm text-gray-400">또는</span>
        </div>

        {/* Dropbox 링크 (파일 직접 링크 또는 백업 폴더 링크) */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Dropbox 링크</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="폴더 링크 또는 novelforge_YYYYMMDD.db 직접 링크"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
            disabled={isLoading}
          />
          <p className="mt-1 text-xs text-gray-500">
            기본값: 백업 폴더. 폴더 링크면 백엔드 실행 시 최신 DB를 자동 선택합니다.
          </p>
          <button
            onClick={handleLoadFromUrl}
            disabled={isLoading}
            className="mt-2 w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? '로딩 중...' : 'DB 로드'}
          </button>
          {isDropboxFolderLink(url.trim()) && !getApiBaseUrl() && url.trim() && (
            <a
              href={url.trim()}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-sm text-blue-600 hover:underline"
            >
              📂 폴더 열기 (최신 DB 파일 링크 복사)
            </a>
          )}
        </div>

        {progress && (
          <p className="mt-4 text-sm text-gray-500 text-center">{progress}</p>
        )}
        {error && (
          <p className="mt-4 text-sm text-red-600 text-center">{error}</p>
        )}
      </div>
    </div>
  );
}
