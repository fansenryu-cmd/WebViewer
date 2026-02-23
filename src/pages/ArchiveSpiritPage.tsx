/**
 * 아카이브의 정령 — AI 채팅 (Gemini API 직접 호출)
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { useDb } from '../hooks/useDb';
import { chatWithSpirit, type ChatMessage } from '../services/geminiService';

const STORAGE_KEY = 'nf-gemini-key';
const EXAMPLE_QUESTIONS = [
  '내 작품 중 가장 성장세가 좋은 작품은?',
  '플랫폼별 조회수 비교를 해줘',
  '최근 7일간 트렌드를 분석해줘',
  '내 소설의 강점과 약점은?',
];

export default function ArchiveSpiritPage() {
  const { db } = useDb();
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(STORAGE_KEY) || '');
  const [keyInput, setKeyInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const saveKey = useCallback(() => {
    const key = keyInput.trim();
    if (key) {
      localStorage.setItem(STORAGE_KEY, key);
      setApiKey(key);
    }
  }, [keyInput]);

  const send = useCallback(
    async (text: string) => {
      if (!db || !apiKey || !text.trim() || sending) return;

      const userMsg: ChatMessage = { role: 'user', text: text.trim() };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setSending(true);

      try {
        const history = messages.map((m) => ({
          role: m.role,
          text: m.text,
        }));
        const reply = await chatWithSpirit(db, apiKey, history, text.trim());
        setMessages((prev) => [...prev, { role: 'model', text: reply }]);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : '오류가 발생했습니다';
        setMessages((prev) => [...prev, { role: 'model', text: `⚠️ ${errMsg}` }]);
      } finally {
        setSending(false);
      }
    },
    [db, apiKey, messages, sending],
  );

  if (!db) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        DB를 먼저 로드해주세요
      </div>
    );
  }

  // API 키 미설정
  if (!apiKey) {
    return (
      <div className="p-4 flex flex-col items-center justify-center h-[60vh] space-y-4">
        <span className="text-5xl">🔮</span>
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">
          아카이브의 정령
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
          Gemini API 키를 입력해주세요.<br />
          키는 이 브라우저에만 저장됩니다.
        </p>
        <div className="w-full max-w-sm flex gap-2">
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveKey()}
            placeholder="AIza..."
            className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm"
          />
          <button
            onClick={saveKey}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600"
          >
            저장
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      {/* 채팅 영역 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center space-y-4 mt-8">
            <span className="text-5xl">🔮</span>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              데이터 기반 질문을 해보세요
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {EXAMPLE_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-300 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-blue-500 text-white rounded-br-md'
                  : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-bl-md'
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-4 py-2 rounded-2xl rounded-bl-md">
              <span className="animate-pulse text-sm text-slate-400">분석 중...</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* 입력 영역 */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send(input)}
            placeholder="질문을 입력하세요..."
            disabled={sending}
            className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-sm disabled:opacity-50"
          />
          <button
            onClick={() => send(input)}
            disabled={sending || !input.trim()}
            className="px-4 py-2 bg-blue-500 text-white rounded-xl text-sm font-medium hover:bg-blue-600 disabled:opacity-50 disabled:hover:bg-blue-500"
          >
            전송
          </button>
        </div>
        <button
          onClick={() => {
            localStorage.removeItem(STORAGE_KEY);
            setApiKey('');
          }}
          className="mt-1 text-xs text-slate-400 hover:text-red-400"
        >
          API 키 초기화
        </button>
      </div>
    </div>
  );
}
