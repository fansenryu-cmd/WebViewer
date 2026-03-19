/**
 * 웹소설 라이브러리 — 플랫폼별 작품 목록 + 작품별 조회수 상세
 */
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
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
import { formatViews, formatDelta, formatDateShort, formatPercent } from '../utils/format';

const ROWS_PER_PAGE = 20;

/* ────────────── 목록 뷰: 소설 카드 ────────────── */

function NovelCard({
  novel,
  latestStats,
  onClick,
}: {
  novel: ManagementNovel;
  latestStats: { views: number; delta: number } | null;
  onClick: () => void;
}) {
  const platform = normalizePlatform(novel.platform);
  const color = PLATFORM_COLORS[platform] || '#9ca3af';

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-3 hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
            {novel.title}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
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
        <div className="flex items-center gap-3 mt-2 text-xs">
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

/* ────────────── 목록 뷰 ────────────── */

function LibraryList({
  novels,
  latestStatsMap,
  onSelect,
}: {
  novels: ManagementNovel[];
  latestStatsMap: Map<number, { views: number; delta: number }>;
  onSelect: (id: number) => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const grouped = useMemo(() => {
    const g = groupByPlatform(novels);
    // PLATFORM_ORDER 순서로 정렬, 나머지는 뒤에
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
  }, [novels]);

  const toggle = (platform: string) =>
    setCollapsed((prev) => ({ ...prev, [platform]: !prev[platform] }));

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">
        웹소설 라이브러리
      </h1>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        총 {novels.length}개 작품
      </p>

      {grouped.map(([platform, list]) => {
        const isCollapsed = collapsed[platform];
        const color = PLATFORM_COLORS[platform] || '#9ca3af';

        return (
          <div key={platform}>
            <button
              onClick={() => toggle(platform)}
              className="flex items-center gap-2 w-full text-left py-1.5"
            >
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {platform}
              </span>
              <span className="text-xs text-slate-400">{list.length}개</span>
              <span className="ml-auto text-xs text-slate-400">
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
                    onClick={() => onSelect(novel.id)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ────────────── 상세 뷰: 조회수 테이블 + 미니 차트 ────────────── */

interface StatsRow {
  date: string;
  views: number;
  delta: number;
  deltaRate: number;
  promotionActive: boolean;
  promotionNote: string;
}

function buildStatsRows(stats: DailyStatistics[]): StatsRow[] {
  // stats는 date ASC 정렬 → 역순으로 변환
  const rows: StatsRow[] = [];
  for (let i = stats.length - 1; i >= 0; i--) {
    const cur = stats[i];
    const prev = i > 0 ? stats[i - 1] : null;
    const delta = prev ? cur.views - prev.views : 0;
    const deltaRate = prev && prev.views > 0 ? (delta / prev.views) * 100 : 0;
    rows.push({
      date: cur.date,
      views: cur.views,
      delta,
      deltaRate,
      promotionActive: cur.promotion_active === 1,
      promotionNote: cur.promotion_note || '',
    });
  }
  return rows;
}

function NovelDetail({
  novel,
  stats,
  onBack,
}: {
  novel: ManagementNovel;
  stats: DailyStatistics[];
  onBack: () => void;
}) {
  const navigate = useNavigate();
  const [page, setPage] = useState(0);

  const rows = useMemo(() => buildStatsRows(stats), [stats]);
  const totalPages = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
  const pageRows = rows.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE);

  // 최근 30일 미니 차트 데이터
  const chartData = useMemo(() => {
    const recent = stats.slice(-30);
    return recent.map((s, i) => {
      const prev = i > 0 ? recent[i - 1] : null;
      return {
        date: formatDateShort(s.date),
        views: s.views,
        delta: prev ? s.views - prev.views : 0,
      };
    });
  }, [stats]);

  const platform = normalizePlatform(novel.platform);
  const color = PLATFORM_COLORS[platform] || '#9ca3af';

  return (
    <div className="p-4 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          className="text-blue-600 dark:text-blue-400 text-sm font-medium"
        >
          &larr; 목록
        </button>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
            {novel.title}
          </h2>
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded-full text-white flex-shrink-0"
            style={{ backgroundColor: color }}
          >
            {platform}
          </span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
          <p>
            <span className="text-slate-400 dark:text-slate-500">작가</span>{' '}
            {novel.author}
          </p>
          <p>
            <span className="text-slate-400 dark:text-slate-500">출판사</span>{' '}
            {novel.publisher || '-'}
          </p>
          <p>
            <span className="text-slate-400 dark:text-slate-500">장르</span>{' '}
            {novel.genre || '-'}
          </p>
          <p>
            <span className="text-slate-400 dark:text-slate-500">런칭일</span>{' '}
            {novel.launch_date || '-'}
          </p>
        </div>

        {/* 요약 카드 */}
        {stats.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <SummaryCard
              label="총 조회수"
              value={formatViews(stats[stats.length - 1].views)}
            />
            <SummaryCard
              label="데이터 기간"
              value={`${stats.length}일`}
            />
            <SummaryCard
              label="최근 수집"
              value={formatDateShort(stats[stats.length - 1].date)}
            />
          </div>
        )}
      </div>

      {/* 바로가기 */}
      <div className="flex gap-2">
        <button
          onClick={() => navigate('/deep-analysis')}
          className="flex-1 text-xs py-2 rounded-lg bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-medium"
        >
          심층 분석
        </button>
        <button
          onClick={() => navigate('/views-growth')}
          className="flex-1 text-xs py-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium"
        >
          성장 추이
        </button>
        <button
          onClick={() => navigate('/stats')}
          className="flex-1 text-xs py-2 rounded-lg bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 font-medium"
        >
          통계 차트
        </button>
      </div>

      {/* 미니 차트 */}
      {chartData.length > 1 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
          <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">
            최근 30일 조회수 추이
          </p>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
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
                  border: '1px solid #e2e8f0',
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
      )}

      {/* 조회수 테이블 */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-700">
          <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
            조회수 이력 ({rows.length}건)
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 disabled:opacity-40"
              >
                &laquo;
              </button>
              <span className="text-slate-500 dark:text-slate-400">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 disabled:opacity-40"
              >
                &raquo;
              </button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-700">
                <th className="text-left px-3 py-2 font-medium">날짜</th>
                <th className="text-right px-3 py-2 font-medium">조회수</th>
                <th className="text-right px-3 py-2 font-medium">증가분</th>
                <th className="text-right px-3 py-2 font-medium">증가율</th>
                <th className="text-center px-3 py-2 font-medium">프로모션</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="text-center py-8 text-slate-400 dark:text-slate-500"
                  >
                    조회수 데이터가 없습니다
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => (
                  <tr
                    key={row.date}
                    className={`border-b border-slate-50 dark:border-slate-700/50 ${
                      row.promotionActive
                        ? 'bg-amber-50/50 dark:bg-amber-900/10'
                        : ''
                    }`}
                  >
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                      {formatDateShort(row.date)}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-200 font-medium">
                      {formatViews(row.views)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-medium ${
                        row.delta > 0
                          ? 'text-green-600 dark:text-green-400'
                          : row.delta < 0
                            ? 'text-red-500 dark:text-red-400'
                            : 'text-slate-400'
                      }`}
                    >
                      {row.delta !== 0 ? formatDelta(row.delta) : '-'}
                    </td>
                    <td
                      className={`px-3 py-2 text-right ${
                        row.deltaRate > 0
                          ? 'text-green-600 dark:text-green-400'
                          : row.deltaRate < 0
                            ? 'text-red-500 dark:text-red-400'
                            : 'text-slate-400'
                      }`}
                    >
                      {row.deltaRate !== 0 ? formatPercent(row.deltaRate) : '-'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {row.promotionActive ? (
                        <span
                          className="inline-block px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-800/40 text-amber-700 dark:text-amber-300 text-[10px]"
                          title={row.promotionNote}
                        >
                          {row.promotionNote
                            ? row.promotionNote.length > 6
                              ? row.promotionNote.slice(0, 6) + '...'
                              : row.promotionNote
                            : 'ON'}
                        </span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center p-2 rounded-lg bg-slate-50 dark:bg-slate-700/50">
      <p className="text-xs text-slate-400 dark:text-slate-500">{label}</p>
      <p className="text-sm font-bold text-slate-700 dark:text-slate-200 mt-0.5">
        {value}
      </p>
    </div>
  );
}

/* ────────────── 메인 페이지 ────────────── */

export default function NovelLibraryPage() {
  const { db } = useDb();
  const [selectedNovelId, setSelectedNovelId] = useState<number | null>(null);

  const novels = useMemo(() => {
    if (!db) return [];
    return getAllNovels(db);
  }, [db]);

  // 각 소설의 최신 2건 통계로 views + delta 계산
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

  // 상세 뷰용 데이터
  const selectedNovel = useMemo(() => {
    if (!db || selectedNovelId === null) return null;
    return novels.find((n) => n.id === selectedNovelId) || null;
  }, [db, novels, selectedNovelId]);

  const selectedStats = useMemo(() => {
    if (!db || selectedNovelId === null) return [];
    return getStatsByNovelId(db, selectedNovelId);
  }, [db, selectedNovelId]);

  if (!db) return null;

  if (selectedNovel) {
    return (
      <NovelDetail
        novel={selectedNovel}
        stats={selectedStats}
        onBack={() => setSelectedNovelId(null)}
      />
    );
  }

  return (
    <LibraryList
      novels={novels}
      latestStatsMap={latestStatsMap}
      onSelect={setSelectedNovelId}
    />
  );
}
