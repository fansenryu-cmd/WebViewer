/**
 * NovelLibraryPage — 웹소설 라이브러리 (매니지먼트 허브)
 * 플랫폼별 작품 목록 + 작품 상세 탭 인터페이스
 */
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ComposedChart,
  Area,
  Bar,
  Legend,
} from 'recharts';
import { useDb } from '../hooks/useDb';
import { getAllNovels, getStatsByNovelId, getLatestTwoStats } from '../db/queries';
import type { ManagementNovel, DailyStatistics } from '../db/types';
import {
  normalizePlatform,
  PLATFORM_ORDER,
  PLATFORM_COLORS,
  groupByPlatform,
} from '../utils/platform';
import { formatViews, formatDelta, formatDateShort } from '../utils/format';
import PlatformBadge from '../components/PlatformBadge';
import DailyStatsTable from '../components/DailyStatsTable';

/* ════════════════════════════════════════════
   초성 매칭 유틸
   ════════════════════════════════════════════ */

const CHOSUNG = [
  'ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ',
  'ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ',
];

function getChosung(str: string): string {
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 0xAC00 && code <= 0xD7A3) {
      result += CHOSUNG[Math.floor((code - 0xAC00) / 588)];
    } else {
      result += str[i];
    }
  }
  return result;
}

function matchesSearch(novel: ManagementNovel, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const title = novel.title.toLowerCase();
  const author = (novel.author || '').toLowerCase();
  // 직접 포함
  if (title.includes(q) || author.includes(q)) return true;
  // 초성 매칭
  const titleChosung = getChosung(novel.title).toLowerCase();
  if (titleChosung.includes(q)) return true;
  return false;
}

/* ════════════════════════════════════════════
   소설 카드 (목록용)
   ════════════════════════════════════════════ */

function NovelCard({
  novel,
  latestStats,
  isSelected,
  onClick,
}: {
  novel: ManagementNovel;
  latestStats: { views: number; delta: number } | null;
  isSelected: boolean;
  onClick: () => void;
}) {
  const platform = normalizePlatform(novel.platform);
  const color = PLATFORM_COLORS[platform] || '#9ca3af';

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-lg border p-2.5 transition-all ${
        isSelected
          ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-500/30'
          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-300 dark:hover:border-blue-600'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
            {novel.title}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            {novel.author} &middot; {novel.genre || '장르 미분류'}
          </p>
        </div>
        <span
          className="flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full text-white"
          style={{ backgroundColor: color }}
        >
          {platform}
        </span>
      </div>

      {latestStats && (
        <div className="flex items-center gap-3 mt-1.5 text-xs">
          <span className="text-slate-600 dark:text-slate-300">
            {formatViews(latestStats.views)}
          </span>
          <span
            className={
              latestStats.delta > 0
                ? 'text-green-600 dark:text-green-400'
                : latestStats.delta < 0
                  ? 'text-red-500 dark:text-red-400'
                  : 'text-slate-400'
            }
          >
            {latestStats.delta !== 0 ? formatDelta(latestStats.delta) : '-'}
          </span>
        </div>
      )}
    </button>
  );
}

/* ════════════════════════════════════════════
   요약 카드
   ════════════════════════════════════════════ */

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="text-center p-2 rounded-lg bg-slate-50 dark:bg-slate-700/50">
      <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">{label}</p>
      <p className="text-sm font-bold text-slate-700 dark:text-slate-200 mt-0.5">{value}</p>
      {sub && <p className="text-[10px] text-slate-400 dark:text-slate-500">{sub}</p>}
    </div>
  );
}

/* ════════════════════════════════════════════
   미니 라인 차트 (최근 30일)
   ════════════════════════════════════════════ */

function MiniTrendChart({ stats, color }: { stats: DailyStatistics[]; color: string }) {
  const data = useMemo(() => {
    const recent = stats.slice(-30);
    return recent.map((s, i) => ({
      date: formatDateShort(s.date),
      views: s.views,
      delta: i > 0 ? s.views - recent[i - 1].views : 0,
    }));
  }, [stats]);

  if (data.length < 2) return null;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
      <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">
        최근 30일 조회수 추이
      </p>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            tickFormatter={(v: number) => formatViews(v)}
            width={50}
          />
          <Tooltip
            formatter={(v: number) => [formatViews(v), '조회수']}
            contentStyle={{
              fontSize: 11,
              borderRadius: 8,
              border: '1px solid #334155',
              backgroundColor: 'rgba(15,23,42,0.9)',
              color: '#e2e8f0',
            }}
          />
          <Line
            type="monotone"
            dataKey="views"
            stroke={color}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ════════════════════════════════════════════
   조회수 상승 탭 (개별 + 통합 차트)
   ════════════════════════════════════════════ */

function ViewsGrowthTab({ stats, title }: { stats: DailyStatistics[]; title: string }) {
  if (stats.length === 0) {
    return (
      <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-8">
        통계 데이터가 없습니다
      </p>
    );
  }

  const data = useMemo(
    () =>
      stats.map((s, i) => ({
        date: s.date.slice(5),
        views: s.views,
        delta: i > 0 ? Math.max(0, s.views - stats[i - 1].views) : 0,
      })),
    [stats],
  );

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
          {title} - 조회수 성장 곡선
        </h3>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              tickFormatter={(v: number) => formatViews(v)}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              tickFormatter={(v: number) => formatViews(v)}
            />
            <Tooltip
              formatter={(v: unknown, n: string) => [
                formatViews(Number(v ?? 0)),
                n === 'views' ? '누적 조회수' : '일일 증가분',
              ]}
              contentStyle={{
                backgroundColor: 'rgba(15,23,42,0.95)',
                border: '1px solid #334155',
                borderRadius: 8,
                fontSize: 12,
                color: '#e2e8f0',
              }}
            />
            <Legend
              formatter={(value: string) =>
                value === 'views' ? '누적 조회수' : '일일 증가분'
              }
              wrapperStyle={{ fontSize: 11 }}
            />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="views"
              fill="rgba(59,130,246,0.15)"
              stroke="#3b82f6"
              strokeWidth={2}
            />
            <Bar
              yAxisId="right"
              dataKey="delta"
              fill="rgba(34,197,94,0.6)"
              radius={[2, 2, 0, 0]}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* 성장 요약 */}
      {data.length > 7 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
          <h4 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">성장 요약</h4>
          <GrowthSummary stats={stats} />
        </div>
      )}
    </div>
  );
}

function GrowthSummary({ stats }: { stats: DailyStatistics[] }) {
  const summary = useMemo(() => {
    const len = stats.length;
    if (len < 2) return null;

    const deltas: number[] = [];
    for (let i = 1; i < len; i++) {
      deltas.push(stats[i].views - stats[i - 1].views);
    }

    const avg7 = len >= 8
      ? deltas.slice(-7).reduce((a, b) => a + b, 0) / 7
      : null;
    const avg30 = len >= 31
      ? deltas.slice(-30).reduce((a, b) => a + b, 0) / 30
      : null;
    const maxDelta = Math.max(...deltas);
    const maxDeltaIdx = deltas.indexOf(maxDelta);
    const maxDeltaDate = maxDeltaIdx >= 0 ? stats[maxDeltaIdx + 1].date : null;

    return { avg7, avg30, maxDelta, maxDeltaDate };
  }, [stats]);

  if (!summary) return null;

  return (
    <div className="grid grid-cols-3 gap-2 text-xs">
      <div className="text-center">
        <p className="text-slate-400 dark:text-slate-500">7일 평균</p>
        <p className="font-bold text-slate-700 dark:text-slate-200">
          {summary.avg7 != null ? formatDelta(Math.round(summary.avg7)) : '-'}
        </p>
      </div>
      <div className="text-center">
        <p className="text-slate-400 dark:text-slate-500">30일 평균</p>
        <p className="font-bold text-slate-700 dark:text-slate-200">
          {summary.avg30 != null ? formatDelta(Math.round(summary.avg30)) : '-'}
        </p>
      </div>
      <div className="text-center">
        <p className="text-slate-400 dark:text-slate-500">최대 증가</p>
        <p className="font-bold text-green-600 dark:text-green-400">
          {formatDelta(summary.maxDelta)}
        </p>
        {summary.maxDeltaDate && (
          <p className="text-[10px] text-slate-400">{formatDateShort(summary.maxDeltaDate)}</p>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   에피소드 분석 탭 (링크)
   ════════════════════════════════════════════ */

function EpisodeAnalysisTab({ novelId }: { novelId: number }) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-4">
      <div className="text-4xl">📖</div>
      <p className="text-sm text-slate-600 dark:text-slate-400 text-center">
        에피소드 구조 x 조회수 타임라인 분석
      </p>
      <button
        onClick={() => navigate(`/episode?novelId=${novelId}`)}
        className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
      >
        에피소드 분석 페이지로 이동
      </button>
    </div>
  );
}

/* ════════════════════════════════════════════
   심층 분석 탭 (링크)
   ════════════════════════════════════════════ */

function DeepAnalysisTab() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-4">
      <div className="text-4xl">🔬</div>
      <p className="text-sm text-slate-600 dark:text-slate-400 text-center">
        시장 구조, 경쟁, 전환 퍼널, 시즌, 프로모션 등 심층 분석
      </p>
      <button
        onClick={() => navigate('/deep-analysis')}
        className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 transition-colors"
      >
        심층 분석 페이지로 이동
      </button>
    </div>
  );
}

/* ════════════════════════════════════════════
   탭 컴포넌트
   ════════════════════════════════════════════ */

type TabId = 'daily' | 'views-growth' | 'episode' | 'deep';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'daily', label: '일일 지표', icon: '📊' },
  { id: 'views-growth', label: '조회수 상승', icon: '📈' },
  { id: 'episode', label: '에피소드 분석', icon: '📖' },
  { id: 'deep', label: '심층 분석', icon: '🔬' },
];

/* ════════════════════════════════════════════
   소설 상세 패널
   ════════════════════════════════════════════ */

function NovelDetailPanel({
  novel,
  stats,
}: {
  novel: ManagementNovel;
  stats: DailyStatistics[];
}) {
  const [activeTab, setActiveTab] = useState<TabId>('daily');
  const platform = normalizePlatform(novel.platform);
  const color = PLATFORM_COLORS[platform] || '#9ca3af';

  // 통계 요약
  const summary = useMemo(() => {
    if (stats.length === 0) return null;
    const totalViews = stats[stats.length - 1].views;
    const firstDate = stats[0].date;
    const lastDate = stats[stats.length - 1].date;
    const days = stats.length;

    let sumDelta = 0;
    for (let i = 1; i < stats.length; i++) {
      sumDelta += stats[i].views - stats[i - 1].views;
    }
    const avgDelta = days > 1 ? sumDelta / (days - 1) : 0;

    return { totalViews, firstDate, lastDate, days, avgDelta };
  }, [stats]);

  return (
    <div className="space-y-3">
      {/* 소설 헤더 */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 leading-tight">
              {novel.title}
            </h2>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
              <span>
                <span className="text-slate-400 dark:text-slate-500">작가</span>{' '}
                {novel.author}
              </span>
              <span>
                <span className="text-slate-400 dark:text-slate-500">출판사</span>{' '}
                {novel.publisher || '-'}
              </span>
              <span>
                <span className="text-slate-400 dark:text-slate-500">장르</span>{' '}
                {novel.genre || '-'}
              </span>
              <span>
                <span className="text-slate-400 dark:text-slate-500">런칭일</span>{' '}
                {novel.launch_date || '-'}
              </span>
            </div>
          </div>
          <PlatformBadge platform={novel.platform} />
        </div>

        {/* 요약 카드 */}
        {summary && (
          <div className="mt-3 grid grid-cols-4 gap-2">
            <SummaryCard
              label="총 조회수"
              value={formatViews(summary.totalViews)}
            />
            <SummaryCard
              label="데이터 기간"
              value={`${summary.days}일`}
              sub={`${formatDateShort(summary.firstDate)}~${formatDateShort(summary.lastDate)}`}
            />
            <SummaryCard
              label="최근 수집"
              value={formatDateShort(summary.lastDate)}
            />
            <SummaryCard
              label="일평균 증가"
              value={formatDelta(Math.round(summary.avgDelta))}
            />
          </div>
        )}
      </div>

      {/* 미니 차트 */}
      <MiniTrendChart stats={stats} color={color} />

      {/* 탭 네비게이션 */}
      <div className="flex gap-1 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 text-xs py-2 rounded-lg font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <span className="hidden sm:inline">{tab.icon} </span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      <div>
        {activeTab === 'daily' && (
          <DailyStatsTable
            stats={stats}
            platform={novel.platform}
            novelId={novel.id}
          />
        )}
        {activeTab === 'views-growth' && (
          <ViewsGrowthTab stats={stats} title={novel.title} />
        )}
        {activeTab === 'episode' && (
          <EpisodeAnalysisTab novelId={novel.id} />
        )}
        {activeTab === 'deep' && <DeepAnalysisTab />}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   메인 페이지
   ════════════════════════════════════════════ */

export default function NovelLibraryPage() {
  const { db } = useDb();
  const navigate = useNavigate();
  const [selectedNovelId, setSelectedNovelId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const novels = useMemo(() => {
    if (!db) return [];
    return getAllNovels(db);
  }, [db]);

  // 검색 필터
  const filteredNovels = useMemo(() => {
    if (!searchQuery.trim()) return novels;
    return novels.filter((n) => matchesSearch(n, searchQuery.trim()));
  }, [novels, searchQuery]);

  // 플랫폼별 그룹
  const grouped = useMemo(() => {
    const g = groupByPlatform(filteredNovels);
    const ordered: [string, ManagementNovel[]][] = [];
    for (const p of PLATFORM_ORDER) {
      if (g[p]) ordered.push([p, g[p]]);
    }
    for (const [p, list] of Object.entries(g)) {
      if (!PLATFORM_ORDER.includes(p as (typeof PLATFORM_ORDER)[number])) {
        ordered.push([p, list]);
      }
    }
    return ordered;
  }, [filteredNovels]);

  // 최신 2건 통계
  const latestStatsMap = useMemo(() => {
    if (!db) return new Map<number, { views: number; delta: number }>();
    const map = new Map<number, { views: number; delta: number }>();
    for (const novel of novels) {
      const two = getLatestTwoStats(db, novel.id);
      if (two.length > 0) {
        const latest = two[0];
        const prev = two.length > 1 ? two[1] : null;
        map.set(novel.id, {
          views: latest.views,
          delta: prev ? latest.views - prev.views : 0,
        });
      }
    }
    return map;
  }, [db, novels]);

  // 선택된 소설
  const selectedNovel = useMemo(() => {
    if (selectedNovelId === null) return null;
    return novels.find((n) => n.id === selectedNovelId) || null;
  }, [novels, selectedNovelId]);

  const selectedStats = useMemo(() => {
    if (!db || selectedNovelId === null) return [];
    return getStatsByNovelId(db, selectedNovelId);
  }, [db, selectedNovelId]);

  const handleSelect = useCallback((id: number) => {
    setSelectedNovelId((prev) => (prev === id ? null : id));
  }, []);

  const togglePlatform = useCallback((platform: string) => {
    setCollapsed((prev) => ({ ...prev, [platform]: !prev[platform] }));
  }, []);

  // 검색 시 선택 초기화 방지 (필터 결과에 없으면 해제)
  useEffect(() => {
    if (selectedNovelId !== null && !filteredNovels.find((n) => n.id === selectedNovelId)) {
      // 검색 결과에 없으면 유지 (상세 패널은 계속 보여줌)
    }
  }, [filteredNovels, selectedNovelId]);

  if (!db) return null;

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">
      {/* 상단 헤더 */}
      <div>
        <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">
          웹소설 라이브러리
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          총 {novels.length}개 작품 관리
        </p>
      </div>

      {/* 퀵 액션 */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => navigate('/report')}
          className="flex-shrink-0 text-xs px-3 py-2 rounded-lg bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 font-medium border border-orange-200 dark:border-orange-800/40 hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
        >
          📊 투데이 리포트
        </button>
        <button
          onClick={() => navigate('/compare')}
          className="flex-shrink-0 text-xs px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium border border-blue-200 dark:border-blue-800/40 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
        >
          📈 다중 비교
        </button>
        <button
          onClick={() => navigate('/title-analysis')}
          className="flex-shrink-0 text-xs px-3 py-2 rounded-lg bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 font-medium border border-purple-200 dark:border-purple-800/40 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
        >
          🔬 제목 분석
        </button>
        <button
          onClick={() => navigate('/views-growth')}
          className="flex-shrink-0 text-xs px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 font-medium border border-green-200 dark:border-green-800/40 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
        >
          📉 성장 추이
        </button>
      </div>

      {/* 검색 */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="작품명 또는 작가명 검색 (초성 지원: ㅎㅅㄴ)"
          className="w-full px-3 py-2 pl-9 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
        />
        <svg
          className="absolute left-3 top-2.5 w-4 h-4 text-slate-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {searchQuery && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          검색 결과: {filteredNovels.length}개 작품
        </p>
      )}

      {/* 소설 목록 (플랫폼별 그룹) */}
      <div className="space-y-3">
        {grouped.map(([platform, list]) => {
          const isCollapsed = collapsed[platform];
          const color = PLATFORM_COLORS[platform] || '#9ca3af';

          return (
            <div key={platform}>
              <button
                onClick={() => togglePlatform(platform)}
                className="flex items-center gap-2 w-full text-left py-1.5 group"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {platform}
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {list.length}개
                </span>
                <span className="ml-auto text-xs text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors">
                  {isCollapsed ? '▸' : '▾'}
                </span>
              </button>

              {!isCollapsed && (
                <div className="grid gap-2 mt-1">
                  {list.map((novel) => (
                    <NovelCard
                      key={novel.id}
                      novel={novel}
                      latestStats={latestStatsMap.get(novel.id) || null}
                      isSelected={selectedNovelId === novel.id}
                      onClick={() => handleSelect(novel.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {grouped.length === 0 && (
          <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-8">
            {searchQuery ? '검색 결과가 없습니다' : '등록된 작품이 없습니다'}
          </p>
        )}
      </div>

      {/* 선택된 소설 상세 */}
      {selectedNovel && (
        <div className="mt-4 pt-4 border-t-2 border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-blue-600 dark:text-blue-400">
              작품 상세
            </h2>
            <button
              onClick={() => setSelectedNovelId(null)}
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              닫기 ✕
            </button>
          </div>
          <NovelDetailPanel novel={selectedNovel} stats={selectedStats} />
        </div>
      )}
    </div>
  );
}
