/**
 * 설정 — DB URL, Gemini API 키
 */
import React, { useState, useEffect } from 'react';
import { getDbUrl, setDbUrl } from '../db/urlStorage';
import { getGeminiApiKey, setGeminiApiKey } from '../utils/settings';
import { useDb } from '../context/DbContext';

export function SettingsPage() {
  const { reset } = useDb();
  const [dbUrl, setDbUrlState] = useState('');
  const [apiKey, setApiKeyState] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDbUrlState(getDbUrl() || '');
    setApiKeyState(getGeminiApiKey() || '');
  }, []);

  const handleSave = () => {
    if (dbUrl.trim()) setDbUrl(dbUrl.trim());
    setGeminiApiKey(apiKey);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleChangeDb = () => {
    reset();
    window.location.hash = '/';
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">설정</h1>

      <section className="mb-8 bg-white rounded-xl shadow p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Dropbox DB URL</h2>
        <input
          type="url"
          value={dbUrl}
          onChange={(e) => setDbUrlState(e.target.value)}
          placeholder="https://www.dropbox.com/s/xxxxx/novelforge.db?dl=0"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-3"
        />
        <button
          onClick={handleChangeDb}
          className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
        >
          DB 다시 로드하기
        </button>
      </section>

      <section className="mb-8 bg-white rounded-xl shadow p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Gemini API 키</h2>
        <p className="text-sm text-gray-600 mb-2">
          아카이브의 정령(AI 채팅)에 사용됩니다. 로컬에만 저장되며 서버로 전송되지 않습니다.
        </p>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKeyState(e.target.value)}
          placeholder="AIza..."
          className="w-full px-4 py-2 border border-gray-300 rounded-lg"
        />
      </section>

      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          저장
        </button>
        {saved && <span className="text-sm text-green-600">저장되었습니다.</span>}
      </div>
    </div>
  );
}
