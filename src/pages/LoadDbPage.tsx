/**
 * DB 로드 페이지 — Google Drive / Dropbox / 로컬 파일
 */
import { useState, useCallback } from 'react';
import { useDb } from '../hooks/useDb';

const DROPBOX_URL_KEY = 'nf-dropbox-url';
const GDRIVE_FOLDER_KEY = 'nf-gdrive-folder';
const GDRIVE_APIKEY_KEY = 'nf-gdrive-apikey';
const LOAD_MODE_KEY = 'nf-load-mode';

const DEFAULT_FOLDER_ID = '1s_oWuwDzG_4bS0ZS1UoGlw2NWYaJfajL';

type LoadMode = 'gdrive' | 'dropbox';

export default function LoadDbPage() {
  const { loading, error, loadFromDropbox, loadFromLocal, loadFromGoogleDrive } = useDb();

  const [mode, setMode] = useState<LoadMode>(
    () => (localStorage.getItem(LOAD_MODE_KEY) as LoadMode) || 'gdrive',
  );
  const [url, setUrl] = useState(() => localStorage.getItem(DROPBOX_URL_KEY) || '');
  const [folderId, setFolderId] = useState(
    () => localStorage.getItem(GDRIVE_FOLDER_KEY) || DEFAULT_FOLDER_ID,
  );
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(GDRIVE_APIKEY_KEY) || '');

  const switchMode = useCallback((m: LoadMode) => {
    setMode(m);
    localStorage.setItem(LOAD_MODE_KEY, m);
  }, []);

  const handleDropbox = useCallback(async () => {
    if (!url.trim()) return;
    localStorage.setItem(DROPBOX_URL_KEY, url.trim());
    await loadFromDropbox(url.trim());
  }, [url, loadFromDropbox]);

  const handleGoogleDrive = useCallback(async () => {
    if (!folderId.trim() || !apiKey.trim()) return;
    localStorage.setItem(GDRIVE_FOLDER_KEY, folderId.trim());
    localStorage.setItem(GDRIVE_APIKEY_KEY, apiKey.trim());
    await loadFromGoogleDrive(folderId.trim(), apiKey.trim());
  }, [folderId, apiKey, loadFromGoogleDrive]);

  const handleFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) loadFromLocal(file);
    },
    [loadFromLocal],
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-slate-800 p-6">
      <div className="w-full max-w-md space-y-6">
        {/* 로고 */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            NovelForge Pro
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            웹 뷰어 — 데이터베이스를 로드해주세요
          </p>
        </div>

        {/* 모드 탭 */}
        <div className="flex rounded-xl bg-slate-100 dark:bg-slate-700/50 p-1">
          <button
            type="button"
            onClick={() => switchMode('gdrive')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
              mode === 'gdrive'
                ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-300 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            🔵 Google Drive
          </button>
          <button
            type="button"
            onClick={() => switchMode('dropbox')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
              mode === 'dropbox'
                ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-300 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            ☁️ Dropbox
          </button>
        </div>

        {/* Google Drive */}
        {mode === 'gdrive' && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-lg border border-slate-200 dark:border-slate-700 space-y-3">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <span>🔵</span> Google Drive에서 로드
            </h2>
            <div className="space-y-2">
              <label className="text-xs text-slate-500 dark:text-slate-400">폴더 ID</label>
              <input
                type="text"
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                placeholder="Google Drive 폴더 ID"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-sm text-slate-800 dark:text-slate-200"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-500 dark:text-slate-400">API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGoogleDrive()}
                placeholder="Google Cloud API Key"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-sm text-slate-800 dark:text-slate-200"
              />
            </div>
            <button
              type="button"
              onClick={handleGoogleDrive}
              disabled={loading || !folderId.trim() || !apiKey.trim()}
              className="w-full py-2.5 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50 transition-colors"
            >
              {loading ? '다운로드 중...' : '최신 DB 다운로드 & 로드'}
            </button>
            <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed">
              폴더를 &quot;링크가 있는 모든 사용자&quot;로 공유 설정해야 합니다.<br />
              novelforge_*.db 파일 중 이름순 최신 파일을 자동으로 선택합니다.
            </p>
          </div>
        )}

        {/* Dropbox URL */}
        {mode === 'dropbox' && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-lg border border-slate-200 dark:border-slate-700 space-y-3">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <span>☁️</span> Dropbox에서 로드
            </h2>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleDropbox()}
              placeholder="Dropbox 공유 링크를 붙여넣기..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-sm text-slate-800 dark:text-slate-200"
            />
            <button
              type="button"
              onClick={handleDropbox}
              disabled={loading || !url.trim()}
              className="w-full py-2.5 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50 transition-colors"
            >
              {loading ? '다운로드 중...' : 'DB 다운로드 & 로드'}
            </button>
          </div>
        )}

        {/* 로컬 파일 */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-lg border border-slate-200 dark:border-slate-700 space-y-3">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <span>📂</span> 로컬 파일에서 로드
          </h2>
          <label className="block w-full py-6 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-center cursor-pointer hover:border-blue-400 transition-colors">
            <span className="text-sm text-slate-500 dark:text-slate-400">
              .db 파일을 선택하거나 드래그
            </span>
            <input
              type="file"
              accept=".db,.sqlite"
              onChange={handleFile}
              className="hidden"
            />
          </label>
        </div>

        {/* 에러 */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {/* 설명 */}
        <p className="text-xs text-center text-slate-400 dark:text-slate-500 leading-relaxed">
          DB 파일은 브라우저 메모리에서만 처리되며<br />
          서버로 전송되지 않습니다. (sql.js 사용)
        </p>
      </div>
    </div>
  );
}
