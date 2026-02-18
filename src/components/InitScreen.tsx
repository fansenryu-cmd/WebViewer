/**
 * 초기 화면 — DB 로드 (로컬 파일 선택 또는 Dropbox 링크)
 * sql.js는 로드 시에만 동적 로드해 앱 첫 화면이 멈추지 않도록 함.
 */
import React, { useState } from 'react';
import { getDbUrl, setDbUrl } from '../db/urlStorage';
import { useDb } from '../context/DbContext';

export function InitScreen() {
  const { setDb, setIsLoading, setError, isLoading, error } = useDb();
  const [url, setUrl] = useState(getDbUrl() || '');
  const [progress, setProgress] = useState('');

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
    setIsLoading(true);
    setError(null);
    setProgress('');
    try {
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

        {/* Dropbox 링크 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Dropbox 링크</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.dropbox.com/s/xxxxx/novelforge.db?dl=0"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
            disabled={isLoading}
          />
          <button
            onClick={handleLoadFromUrl}
            disabled={isLoading}
            className="mt-2 w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? '로딩 중...' : 'DB 로드'}
          </button>
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
