/**
 * 제목 패턴 분석 페이지 (데이터베이스 분석 리포트)
 * - 제목 패턴 (수식어/직업/행동/기타 키워드)
 * - 키워드 빈도 TOP30 (플랫폼별)
 * - 장르 성장률 (이번 주 vs 지난 주)
 */
import { useMemo, useState } from 'react';
import { useDb } from '../hooks/useDb';
import { getFullTitleAnalysis, getKeywordFrequency, getGenreGrowth } from '../services/titlePatternService';
import type { PatternItem, KeywordFreqRow, GenreGrowthItem } from '../db/types';

type SubTab = 'patterns' | 'keyword-freq' | 'genre-growth';

const PLATFORM_COLORS: Record<string, string> = {
  '네이버시리즈': '#16a34a',
  '카카오페이지': '#ca8a04',
  '문피아': '#7c3aed',
  '리디': '#2563eb',
  '노벨피아': '#ea580c',
};

function getPlatformColor(p: string): string {
  for (const [key, color] of Object.entries(PLATFORM_COLORS)) {
    if (p.includes(key) || key.includes(p)) return color;
  }
  return '#64748b';
}

export default function TitlePatternPage() {
  const { db } = useDb();
  const [subTab, setSubTab] = useState<SubTab>('patterns');
  const [days, setDays] = useState(60);

  const analysis = useMemo(() => {
    if (!db) return null;
    return getFullTitleAnalysis(db, days);
  }, [db, days]);

  const keywordFreq = useMemo(() => {
    if (!db) return [];
    return getKeywordFrequency(db, days, 30);
  }, [db, days]);

  const genreGrowth = useMemo(() => {
    if (!db) return [];
    return getGenreGrowth(db);
  }, [db]);

  if (!db) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 dark:text-slate-500">
        DB를 먼저 로드해주세요
      </div>
    );
  }

  if (!analysis || analysis.totalTitles === 0) {
    return (
      <div className="p-4 space-y-3">
        <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">📊 데이터베이스 분석</h1>
        <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-6 text-center text-slate-600 dark:text-slate-400 text-sm">
          분석할 랭킹 데이터가 없습니다.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">📊 데이터베이스 분석</h1>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {analysis.totalTitles}개 제목 · 최근 {days}일
        </span>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="ml-auto px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-xs text-slate-800 dark:text-slate-200"
        >
          <option value={30}>30일</option>
          <option value={60}>60일</option>
          <option value={90}>90일</option>
        </select>
      </div>

      {/* 서브탭 */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 text-xs">
        {([
          { key: 'patterns' as SubTab, label: '제목 패턴' },
          { key: 'keyword-freq' as SubTab, label: '키워드 빈도' },
          { key: 'genre-growth' as SubTab, label: '장르 성장률' },
        ]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={`flex-1 py-1.5 px-2 rounded-md transition-colors ${
              subTab === key
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 font-semibold shadow-sm'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {subTab === 'patterns' && <PatternsView patterns={analysis.patterns} />}
      {subTab === 'keyword-freq' && <KeywordFreqView data={keywordFreq} />}
      {subTab === 'genre-growth' && <GenreGrowthView data={genreGrowth} />}
    </div>
  );
}

/* ── 서브탭 1: 제목 패턴 ── */
function PatternsView({ patterns }: { patterns: { modifiers: PatternItem[]; jobs: PatternItem[]; actions: PatternItem[]; other_keywords: PatternItem[] } }) {
  const sections = [
    { title: '수식어', items: patterns.modifiers, color: 'text-purple-600 dark:text-purple-400' },
    { title: '직업/역할', items: patterns.jobs, color: 'text-blue-600 dark:text-blue-400' },
    { title: '행동/소재', items: patterns.actions, color: 'text-emerald-600 dark:text-emerald-400' },
    { title: '기타 키워드', items: patterns.other_keywords, color: 'text-slate-600 dark:text-slate-300' },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {sections.map(({ title, items, color }) => (
        <div key={title} className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
          <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">{title}</h3>
          {items.length === 0 ? (
            <p className="text-xs text-slate-400">데이터 없음</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {items.slice(0, 20).map((item) => (
                <span
                  key={item.keyword}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-slate-100 dark:bg-slate-700 ${color}`}
                >
                  {item.keyword}
                  <span className="text-slate-400 dark:text-slate-500 font-mono">{item.count}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── 서브탭 2: 키워드 빈도 ── */
function KeywordFreqView({ data }: { data: KeywordFreqRow[] }) {
  if (data.length === 0) {
    return <p className="text-xs text-slate-500 text-center py-6">데이터 없음</p>;
  }

  const maxTotal = Math.max(...data.map((r) => r.total), 1);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700 overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
            <th className="text-left py-1.5 px-1 w-6">#</th>
            <th className="text-left py-1.5 px-1">키워드</th>
            <th className="text-left py-1.5 px-1 min-w-[120px]">플랫폼 분포</th>
            <th className="text-right py-1.5 px-1 w-12">합계</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={row.keyword} className="border-b border-slate-100 dark:border-slate-700/50">
              <td className="py-1.5 px-1 text-slate-400">{i + 1}</td>
              <td className="py-1.5 px-1 text-slate-800 dark:text-slate-200 font-medium">{row.keyword}</td>
              <td className="py-1.5 px-1">
                <div className="flex h-3 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-700">
                  {Object.entries(row.platforms).map(([platform, count]) => (
                    <div
                      key={platform}
                      style={{
                        width: `${(count / maxTotal) * 100}%`,
                        backgroundColor: getPlatformColor(platform),
                        minWidth: count > 0 ? '2px' : '0',
                      }}
                      title={`${platform}: ${count}`}
                    />
                  ))}
                </div>
              </td>
              <td className="py-1.5 px-1 text-right text-slate-600 dark:text-slate-300 font-mono">{row.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
        {Object.entries(PLATFORM_COLORS).map(([name, color]) => (
          <span key={name} className="flex items-center gap-1 text-[10px] text-slate-500">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── 서브탭 3: 장르 성장률 ── */
function GenreGrowthView({ data }: { data: GenreGrowthItem[] }) {
  if (data.length === 0) {
    return <p className="text-xs text-slate-500 text-center py-6">데이터 없음</p>;
  }

  const maxRate = Math.max(...data.map((r) => Math.abs(r.growth_rate)), 1);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700 space-y-2">
      <p className="text-xs text-slate-500 dark:text-slate-400">이번 주 vs 지난 주 장르별 등록 작품 수 비교</p>
      {data.map((item) => (
        <div key={item.genre} className="flex items-center gap-2 text-xs">
          <span className="w-20 text-slate-700 dark:text-slate-300 truncate font-medium" title={item.genre}>
            {item.genre}
          </span>
          <div className="flex-1 flex items-center gap-1">
            <div className="flex-1 h-4 relative bg-slate-100 dark:bg-slate-700 rounded-sm overflow-hidden">
              <div
                className={`absolute top-0 h-full rounded-sm ${
                  item.growth_rate >= 0
                    ? 'bg-emerald-500/80 left-1/2'
                    : 'bg-red-500/80 right-1/2'
                }`}
                style={{
                  width: `${(Math.abs(item.growth_rate) / maxRate) * 50}%`,
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                  {item.prev_count} → {item.this_count}
                </span>
              </div>
            </div>
          </div>
          <span
            className={`w-16 text-right font-mono ${
              item.growth_rate > 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : item.growth_rate < 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-slate-500'
            }`}
          >
            {item.growth_rate > 0 ? '+' : ''}{item.growth_rate.toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}
