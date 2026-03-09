/**
 * 다중 작품 비교 페이지 — 최대 3개 작품 성장 곡선 오버레이 + 병렬 그래프
 * Desktop MultiNovelCompareView.tsx 포팅 (sql.js 기반, API 호출 없음)
 */
import { useState, useMemo, useCallback } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useDb } from '../hooks/useDb';
import { getAllNovels, getStatsByNovelId } from '../db/queries';
import { buildNovelSeries } from '../services/aggregateService';
import { normalizePlatform, PLATFORM_ORDER } from '../utils/platform';
import type { ManagementNovel, SeriesPoint } from '../db/types';

/* ── 상수 ── */
const COMPARE_COLORS = ['#2563eb', '#16a34a', '#dc2626'] as const;
const COMPARE_LABELS = ['작품 A', '작품 B', '작품 C'] as const;

/* ── 타입 ── */
interface CompareNovel {
  id: number;
  title: string;
  platform: string;
  launchDate: string | null;
  totalViews: number;
  series: SeriesPoint[];
}

/* ── 유틸: 여러 시리즈를 daysSinceLaunch 기준으로 병합 ── */
function mergeCompareSeries(
  novels: CompareNovel[],
): Array<{ daysSinceLaunch: number; [key: string]: number }> {
  const daySet = new Set<number>();
  novels.forEach((n) => n.series.forEach((p) => daySet.add(p.daysSinceLaunch)));
  const days = Array.from(daySet).sort((a, b) => a - b);

  const maps = novels.map(
    (n) => new Map(n.series.map((p) => [p.daysSinceLaunch, p.cumulativeViews])),
  );

  return days.map((d) => {
    const row: { daysSinceLaunch: number; [key: string]: number } = { daysSinceLaunch: d };
    novels.forEach((n, i) => {
      row[`views_${n.id}`] = maps[i].get(d) ?? 0;
    });
    return row;
  });
}

/* ── 유틸: 조회수 포매팅 ── */
function formatViews(v: number): string {
  if (v >= 10000) return `${(v / 10000).toFixed(1)}만`;
  return v.toLocaleString();
}

function formatViewsShort(v: number): string {
  if (v >= 10000) return `${(v / 10000).toFixed(0)}만`;
  return String(v);
}

/* ── 유틸: 플랫폼별 그룹핑 (PLATFORM_ORDER 순서 보장) ── */
function groupNovelsByPlatform(novels: ManagementNovel[]): [string, ManagementNovel[]][] {
  const map = new Map<string, ManagementNovel[]>();
  for (const n of novels) {
    const p = normalizePlatform(n.platform);
    if (!map.has(p)) map.set(p, []);
    map.get(p)!.push(n);
  }

  const ordered: [string, ManagementNovel[]][] = [];
  for (const p of PLATFORM_ORDER) {
    if (map.has(p)) ordered.push([p, map.get(p)!]);
  }
  for (const [p, list] of map) {
    if (!PLATFORM_ORDER.includes(p as (typeof PLATFORM_ORDER)[number])) {
      ordered.push([p, list]);
    }
  }
  return ordered;
}

/* ══════════════════════════════════════════════════════════
 * 메인 컴포넌트
 * ══════════════════════════════════════════════════════════ */
export default function MultiNovelComparePage() {
  const { db } = useDb();
  const [selectedIds, setSelectedIds] = useState<(number | null)[]>([null, null, null]);

  /* ── 소설 목록 (launch_date 있는 것만) ── */
  const novels = useMemo(() => {
    if (!db) return [];
    return getAllNovels(db).filter((n) => n.launch_date != null);
  }, [db]);

  /* ── 플랫폼별 그룹 ── */
  const novelsByPlatform = useMemo(() => groupNovelsByPlatform(novels), [novels]);

  /* ── 실제 선택된 id (null 제외) ── */
  const activeIds = useMemo(
    () => selectedIds.filter((id): id is number => id != null),
    [selectedIds],
  );

  /* ── 비교 데이터 빌드 (sql.js에서 직접 조회) ── */
  const compareNovels = useMemo<CompareNovel[]>(() => {
    if (!db || activeIds.length === 0) return [];

    return activeIds
      .map((id) => {
        const novel = novels.find((n) => n.id === id);
        if (!novel) return null;

        const stats = getStatsByNovelId(db, id);
        if (stats.length === 0) return null;

        const { totalViews, series } = buildNovelSeries(novel.launch_date, stats);
        if (series.length === 0) return null;

        return {
          id: novel.id,
          title: novel.title,
          platform: normalizePlatform(novel.platform),
          launchDate: novel.launch_date,
          totalViews,
          series,
        };
      })
      .filter((n): n is CompareNovel => n != null);
  }, [db, activeIds, novels]);

  /* ── 오버레이 차트 데이터 ── */
  const chartData = useMemo(
    () => (compareNovels.length > 0 ? mergeCompareSeries(compareNovels) : []),
    [compareNovels],
  );

  /* ── 핸들러 ── */
  const handleSlotChange = useCallback(
    (slotIndex: number, value: string) => {
      setSelectedIds((prev) => {
        const next = [...prev];
        next[slotIndex] = value === '' ? null : parseInt(value, 10);
        return next;
      });
    },
    [],
  );

  const handleClearSlot = useCallback((slotIndex: number) => {
    setSelectedIds((prev) => {
      const next = [...prev];
      next[slotIndex] = null;
      return next;
    });
  }, []);

  const handleClearAll = useCallback(() => {
    setSelectedIds([null, null, null]);
  }, []);

  /* ── DB 미로드 ── */
  if (!db) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        DB를 먼저 로드해주세요
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* 타이틀 */}
      <div>
        <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">
          다중 작품 비교
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          최대 3개 작품을 선택하면 런칭일 기준 성장 곡선을 한 그래프에 겹쳐 보여줍니다.
        </p>
      </div>

      {/* ── 작품 선택 (3슬롯 드롭다운) ── */}
      <section className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-700">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
          비교할 작품 선택 (최대 3개)
        </h2>

        {novels.length === 0 ? (
          <p className="text-sm text-slate-400">
            런칭일이 있는 작품이 없습니다. 데스크톱 앱에서 작품을 등록하고 연재 시작일을 입력해 주세요.
          </p>
        ) : (
          <div className="space-y-2.5">
            {selectedIds.map((slotId, slotIdx) => {
              const otherSelectedIds = selectedIds.filter(
                (id, i) => i !== slotIdx && id != null,
              ) as number[];

              const selectedNovel =
                slotId != null ? novels.find((n) => n.id === slotId) : null;

              return (
                <div key={slotIdx} className="flex items-center gap-2">
                  {/* 색상 인디케이터 */}
                  <div
                    className="flex-shrink-0 w-3 h-3 rounded-full"
                    style={{ backgroundColor: COMPARE_COLORS[slotIdx] }}
                  />

                  {/* 슬롯 라벨 */}
                  <span className="flex-shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400 w-11">
                    {COMPARE_LABELS[slotIdx]}
                  </span>

                  {/* 드롭다운 */}
                  <select
                    value={slotId ?? ''}
                    onChange={(e) => handleSlotChange(slotIdx, e.target.value)}
                    className="flex-1 min-w-0 px-2.5 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 hover:border-slate-400 dark:hover:border-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    aria-label={`${COMPARE_LABELS[slotIdx]} 선택`}
                  >
                    <option value="">-- 작품 선택 --</option>
                    {novelsByPlatform.map(([platform, platformNovels]) => {
                      const hasRelevant =
                        platformNovels.some((n) => !otherSelectedIds.includes(n.id)) ||
                        platformNovels.some((n) => n.id === slotId);
                      if (!hasRelevant) return null;

                      return (
                        <optgroup key={platform} label={platform}>
                          {platformNovels.map((n) => (
                            <option
                              key={n.id}
                              value={n.id}
                              disabled={otherSelectedIds.includes(n.id)}
                            >
                              {n.title}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>

                  {/* 해제 버튼 */}
                  {slotId != null && (
                    <button
                      type="button"
                      onClick={() => handleClearSlot(slotIdx)}
                      className="flex-shrink-0 px-1.5 py-1 text-xs text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                      title="선택 해제"
                    >
                      ✕
                    </button>
                  )}

                  {/* 런칭일 요약 */}
                  {selectedNovel?.launch_date && (
                    <span className="flex-shrink-0 text-[10px] text-slate-400 dark:text-slate-500 hidden sm:inline">
                      {selectedNovel.launch_date.slice(0, 10)}
                    </span>
                  )}
                </div>
              );
            })}

            {/* 선택 카운트 + 전체 해제 */}
            {activeIds.length > 0 && (
              <div className="flex items-center gap-2 pt-0.5">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {activeIds.length}개 작품 선택됨
                </span>
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-xs text-slate-400 hover:text-red-500 dark:hover:text-red-400 underline transition-colors"
                >
                  전체 해제
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── 비교 결과 ── */}
      {compareNovels.length > 0 && chartData.length > 0 && (
        <>
          {/* 오버레이 차트 */}
          <section className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-700">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
              성장 추이 (합쳐보기)
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="daysSinceLaunch"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(v) => `${v}일`}
                  tick={{ fontSize: 10 }}
                  label={{
                    value: '런칭일 대비 경과일',
                    position: 'insideBottom',
                    offset: -28,
                    style: { fontSize: 11, fill: '#94a3b8' },
                  }}
                />
                <YAxis
                  tickFormatter={formatViewsShort}
                  tick={{ fontSize: 10 }}
                  width={40}
                  label={{
                    value: '누적 조회수',
                    angle: -90,
                    position: 'insideLeft',
                    offset: 10,
                    style: { fontSize: 11, fill: '#94a3b8' },
                  }}
                />
                <Tooltip
                  formatter={(value: number) => [formatViews(value), '조회수']}
                  labelFormatter={(label) => `경과 ${label}일`}
                  contentStyle={{
                    backgroundColor: 'rgba(255,255,255,0.95)',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11 }}
                />
                {compareNovels.map((n, i) => (
                  <Line
                    key={n.id}
                    type="monotone"
                    dataKey={`views_${n.id}`}
                    name={`${n.platform} ${n.title.length > 10 ? n.title.slice(0, 10) + '...' : n.title}`}
                    stroke={COMPARE_COLORS[i % COMPARE_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </section>

          {/* 병렬 개별 차트 */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {compareNovels.map((n, i) => (
              <div
                key={n.id}
                className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700"
              >
                <h3
                  className="text-xs font-semibold truncate mb-2"
                  style={{ color: COMPARE_COLORS[i % COMPARE_COLORS.length] }}
                >
                  [{n.platform}] {n.title}
                </h3>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart
                    data={n.series}
                    margin={{ top: 4, right: 8, left: 0, bottom: 28 }}
                  >
                    <CartesianGrid strokeDasharray="2 2" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="daysSinceLaunch"
                      type="number"
                      tickFormatter={(v) => `${v}일`}
                      tick={{ fontSize: 9 }}
                      label={{
                        value: '경과일',
                        position: 'insideBottom',
                        offset: -18,
                        style: { fontSize: 9, fill: '#94a3b8' },
                      }}
                    />
                    <YAxis
                      tickFormatter={formatViewsShort}
                      tick={{ fontSize: 9 }}
                      width={32}
                    />
                    <Tooltip
                      formatter={(value: number) => [formatViews(value), '조회수']}
                      labelFormatter={(label) => `경과 ${label}일`}
                      contentStyle={{
                        backgroundColor: 'rgba(255,255,255,0.95)',
                        border: '1px solid #e2e8f0',
                        borderRadius: 6,
                        fontSize: 11,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="cumulativeViews"
                      stroke={COMPARE_COLORS[i % COMPARE_COLORS.length]}
                      strokeWidth={1.5}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                  총 조회수: {formatViews(n.totalViews)}
                </p>
              </div>
            ))}
          </section>
        </>
      )}

      {/* 선택했지만 데이터 없음 */}
      {activeIds.length > 0 && compareNovels.length === 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-300 px-4 py-3 rounded-lg text-sm">
          선택한 작품 중 런칭일 또는 일일 지표가 있는 작품이 없거나 데이터가 비어 있습니다.
        </div>
      )}

      {/* 아무것도 선택 안 함 */}
      {activeIds.length === 0 && (
        <div className="text-center py-12 text-slate-400 dark:text-slate-500 text-sm">
          위에서 비교할 작품을 선택해주세요
        </div>
      )}
    </div>
  );
}
