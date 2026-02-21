/**
 * 아카이브의 정령 — RAG 기반 AI 채팅 (Step 11)
 * 프론트엔드에서 DB 컨텍스트 추출 후 Gemini API 직접 호출
 */
import React, { useState, useRef, useEffect } from 'react';
import { useDb } from '../context/DbContext';
import {
  getNovelsSummaryForRAG,
  getRecentGrowthForRAG,
  getRecentRankingsForRAG,
  getLatestRankingDate,
} from '../db/queries';
import { getGeminiApiKey } from '../utils/settings';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

function buildRAGContext(db: import('sql.js').Database): string {
  const lines: string[] = [];
  lines.push('=== 소설 목록 (최근 100개) ===');
  const novels = getNovelsSummaryForRAG(db, 100);
  novels.forEach((n) => {
    lines.push(`- [${n.id}] ${n.title} | ${n.author || '?'} | ${n.platform || '?'} | 런칭: ${n.launch_date || '-'}`);
  });

  const latestDate = getLatestRankingDate(db);
  if (latestDate) {
    lines.push('\n=== 최근 성장률 (최근 30일 기준) ===');
    const growth = getRecentGrowthForRAG(db, latestDate, 30);
    growth.forEach((g) => {
      const old = g.old_views ?? 0;
      const rate = old ? (((g.recent_views - old) / old) * 100).toFixed(1) : '-';
      lines.push(`- ${g.title} (${g.platform}) | 최근: ${g.recent_views.toLocaleString()} | 성장률: ${rate}%`);
    });

    lines.push('\n=== 최근 랭킹 ===');
    const rankings = getRecentRankingsForRAG(db, 50);
    const byPlatform: Record<string, typeof rankings> = {};
    for (const r of rankings) {
      if (!byPlatform[r.platform]) byPlatform[r.platform] = [];
      byPlatform[r.platform].push(r);
    }
    for (const [platform, list] of Object.entries(byPlatform)) {
      lines.push(`\n[${platform}] ${latestDate}`);
      list.slice(0, 10).forEach((r) => {
        lines.push(`  ${r.rank}. ${r.title} (${r.author})`);
      });
    }
  }

  return lines.join('\n');
}

export function ArchiveSpiritPage() {
  const { db } = useDb();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (textToSend: string) => {
    const text = textToSend.trim();
    if (!text || !db) return;

    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      setError('Gemini API 키가 설정되지 않았습니다. 설정 페이지에서 입력해주세요.');
      return;
    }

    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const context = buildRAGContext(db);
      const sysPrompt = `당신은 "아카이브의 정령"이라는 웹소설 통계 아카이브의 AI 어시스턴트입니다.
아래는 NovelForge DB에서 추출한 최신 데이터입니다. 사용자 질문에 이 데이터를 기반으로 답변해주세요.
데이터에 없는 내용은 추측하지 말고 "해당 데이터가 없습니다"라고 답변하세요.
한국어로 친절하고 간결하게 답변해주세요.

--- 데이터 ---
${context}
---`;
      const userContent = text;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              { role: 'user', parts: [{ text: sysPrompt + '\n\n[사용자 질문]\n' + userContent }] },
            ],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 2048,
            },
          }),
        },
      );

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`API 오류: ${response.status} ${errBody.slice(0, 200)}`);
      }

      const data = await response.json();
      const textPart = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      const assistantText = textPart?.trim() || '답변을 생성하지 못했습니다.';
      setMessages((prev) => [...prev, { role: 'assistant', content: assistantText }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '요청 실패';
      setError(msg);
      setMessages((prev) => [...prev, { role: 'assistant', content: `오류: ${msg}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = () => sendMessage(input);
  const handleTodayReport = () =>
    sendMessage('오늘 수집된 랭킹과 조회수 데이터를 요약해주고, 주요 트렌드를 알려줘.');

  if (!db) return null;

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-h-[700px]">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">아카이브의 정령</h1>
      <p className="text-gray-600 mb-4 text-sm">
        DB에 저장된 소설·랭킹·성장 데이터를 기반으로 질문하세요.
      </p>

      <button
        type="button"
        onClick={handleTodayReport}
        disabled={loading}
        className="self-start mb-4 px-4 py-2 text-sm font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-50"
      >
        📊 오늘의 분석
      </button>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      <div className="flex-1 overflow-y-auto bg-white rounded-xl border border-gray-200 p-4 mb-4">
        {messages.length === 0 && (
          <p className="text-gray-500 text-sm">
            예: &quot;최근 성장률이 높은 소설은?&quot;, &quot;문피아 랭킹 1위는?&quot;
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`mb-3 ${m.role === 'user' ? 'text-right' : 'text-left'}`}
          >
            <span
              className={`inline-block max-w-[85%] px-3 py-2 rounded-lg text-sm ${
                m.role === 'user'
                  ? 'bg-blue-100 text-blue-900'
                  : 'bg-gray-100 text-gray-900 whitespace-pre-wrap'
              }`}
            >
              {m.content}
            </span>
          </div>
        ))}
        {loading && (
          <div className="text-left text-gray-500 text-sm">생각 중...</div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder="질문을 입력하세요..."
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          disabled={loading}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          전송
        </button>
      </div>
    </div>
  );
}
