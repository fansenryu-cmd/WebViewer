/**
 * 조회수 상승 그래프 (Views Growth Page) — web-viewer 전용
 *
 * 3개 섹션:
 *   1. 개별 작품 조회수 상승 (누적 조회수 Line + 일일 증가분 Area)
 *   2. 통합 통계 (플랫폼 퍼센타일 비교: 상위 20/40/60/80% + 내 작품)
 *   3. 예측 성장 추이 (최근 7일 조회수 증가 기울기 기반 선형 외삽)
 *
 * 모든 데이터는 sql.js 인메모리 DB에서 직접 쿼리합니다 (API 호출 없음).
 */
import { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  ComposedChart,
  ReferenceLine,
} from 'recharts';
import { useDb } from '../hooks/useDb';
import { getAllNovels, getStatsByNovelId } from '../db/queries';
import { buildNovelSeries, getAggregateStats } from '../services/aggregateService';
import { normalizePlatform, PLATFORM_COLORS } from '../utils/platform';
import NovelSelector from '../components/NovelSelector';
import type { ManagementNovel, SeriesPoint, PlatformAggregate } from '../db/types';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** X축 경과일 버킷 단위 (일). 인덱스 증가 = 확대(촘촘) */
const BUCKET_DAYS = [365, 200, 100, 30, 7, 1] as const;
const DEFAULT_BUCKET_INDEX = 3;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Section 1 chart point */
interface IndividualPoint {
  date: string;
  cumulativeViews: number;
  delta: number;
}

/** Section 2 merged row */
interface AggregateMergedRow {
  daysSinceLaunch: number;
  top20: number | null;
  top40: number | null;
  top60: number | null;
  top80: number | null;
  myNovel: number | null;
}

/** Section 3 prediction row */
interface PredictionRow {
  daysSinceLaunch: number;
  actual: number | null;
  predicted: number | null;
  zone: 'explosion' | 'decline' | 'normal' | null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** 조회수 포맷 (만 단위) */
function formatViews(v: number): string {
  if (v >= 10000) return `${(v / 10000).toFixed(1)}만`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}천`;
  return v.toLocaleString();
}

/** 플랫폼별 조회수 포맷 (네이버/카카오는 이미 만 단위) */
function makeFormatViews(platform: string): (val: number) => string {
  if (/네이버|카카오/.test(platform)) {
    return (val: number) => val.toFixed(1) + '만';
  }
  return formatViews;
}

/** X축 날짜 포맷터: 연도가 바뀔 때만 연도 표기 */
function makeSmartDateFormatter(allDates: string[]): (dateStr: string) => string {
  const showYearSet = new Set<string>();
  let prevYear = '';
  for (const d of allDates) {
    if (!d || d.length < 10) continue;
    const y = d.substring(0, 4);
    if (y !== prevYear) {
      showYearSet.add(d);
      prevYear = y;
    }
  }
  return (dateStr: string) => {
    if (!dateStr || dateStr.length < 10) return dateStr;
    const md = dateStr.substring(5, 7) + '.' + dateStr.substring(8, 10);
    if (showYearSet.has(dateStr)) {
      return dateStr.substring(2, 4) + '.' + md;
    }
    return md;
  };
}

/** 런칭일(day 0) 보존하며 버킷별로 묶어 표시용 데이터 생성 */
function aggregateMergedByBucket<T extends { daysSinceLaunch: number }>(
  rows: T[],
  bucketDays: number,
): T[] {
  if (bucketDays <= 0 || rows.length === 0) return rows;
  let day0Row: T | undefined;
  const byBucket = new Map<number, T>();
  for (const row of rows) {
    if (row.daysSinceLaunch === 0) {
      day0Row = { ...row };
      continue;
    }
    const bucket = Math.floor(row.daysSinceLaunch / bucketDays) * bucketDays;
    const existing = byBucket.get(bucket);
    if (!existing || row.daysSinceLaunch > existing.daysSinceLaunch) {
      byBucket.set(bucket, { ...row });
    }
  }
  const result = [...byBucket.values()].sort((a, b) => a.daysSinceLaunch - b.daysSinceLaunch);
  if (day0Row) result.unshift(day0Row);
  return result;
}

/** 퍼센타일 시리즈를 하나의 행 배열로 머지 */
function mergePercentileSeries(data: PlatformAggregate): AggregateMergedRow[] {
  const daySet = new Set<number>();
  data.top20.forEach((p) => daySet.add(p.daysSinceLaunch));
  data.top40?.forEach((p) => daySet.add(p.daysSinceLaunch));
  data.top60?.forEach((p) => daySet.add(p.daysSinceLaunch));
  data.top80?.forEach((p) => daySet.add(p.daysSinceLaunch));
  if (data.myNovel) data.myNovel.forEach((p) => daySet.add(p.daysSinceLaunch));

  const days = Array.from(daySet).sort((a, b) => a - b);
  const top20Map = new Map(data.top20.map((p) => [p.daysSinceLaunch, p.cumulativeViews]));
  const top40Map = data.top40?.length
    ? new Map(data.top40.map((p) => [p.daysSinceLaunch, p.cumulativeViews]))
    : null;
  const top60Map = data.top60?.length
    ? new Map(data.top60.map((p) => [p.daysSinceLaunch, p.cumulativeViews]))
    : null;
  const top80Map = data.top80?.length
    ? new Map(data.top80.map((p) => [p.daysSinceLaunch, p.cumulativeViews]))
    : null;
  const myMap = data.myNovel
    ? new Map(data.myNovel.map((p) => [p.daysSinceLaunch, p.cumulativeViews]))
    : null;

  return days.map((d) => {
    const t20 = top20Map.get(d) ?? null;
    let t40: number | null = top40Map ? (top40Map.get(d) ?? null) : null;
    let t60: number | null = top60Map ? (top60Map.get(d) ?? null) : null;
    let t80: number | null = top80Map ? (top80Map.get(d) ?? null) : null;
    // 보간 (top40/60/80이 없으면 top20 기반으로 분할)
    if (t40 == null && t20 !== null) t40 = t20 * 0.75;
    if (t60 == null && t20 !== null) t60 = t20 * 0.5;
    if (t80 == null && t20 !== null) t80 = t20 * 0.25;
    return {
      daysSinceLaunch: d,
      top20: t20,
      top40: t40,
      top60: t60,
      top80: t80,
      myNovel: myMap ? (myMap.get(d) ?? null) : null,
    };
  });
}

/**
 * Build prediction rows.
 * 기울기: 해당 작품의 최근 7일간 조회수 증가 수치의 일일 평균 증가량.
 * 예측선은 이 기울기 하나로 선형 외삽 (1/3/6개월 구간 구분 없음).
 */
function buildPredictionData(myNovelData: SeriesPoint[]): PredictionRow[] {
  if (myNovelData.length < 2) return [];

  const sorted = [...myNovelData].sort((a, b) => a.daysSinceLaunch - b.daysSinceLaunch);
  const lastPoint = sorted[sorted.length - 1];
  const lastDay = lastPoint.daysSinceLaunch;
  const lastViews = lastPoint.cumulativeViews;

  // 최근 7일 구간의 일일 평균 조회수 증가량(기울기) 계산
  const windowStart = Math.max(0, lastDay - 7);
  const inWindow = sorted.filter(
    (p) => p.daysSinceLaunch >= windowStart && p.daysSinceLaunch <= lastDay,
  );
  let slope = 0;
  if (inWindow.length >= 2) {
    const first = inWindow[0];
    const last = inWindow[inWindow.length - 1];
    const dayDiff = last.daysSinceLaunch - first.daysSinceLaunch;
    slope = dayDiff > 0 ? (last.cumulativeViews - first.cumulativeViews) / dayDiff : 0;
  } else if (sorted.length >= 2) {
    const prev = sorted[sorted.length - 2];
    const dayDiff = lastDay - prev.daysSinceLaunch;
    slope = dayDiff > 0 ? (lastViews - prev.cumulativeViews) / dayDiff : 0;
  }

  const rows: PredictionRow[] = [];

  // 과거 실제 데이터
  for (const p of sorted) {
    const daysSinceEnd = p.daysSinceLaunch - lastDay;
    const predicted = lastViews + slope * daysSinceEnd;
    let zone: PredictionRow['zone'] = null;
    if (predicted > 0) {
      const ratio = p.cumulativeViews / predicted;
      if (ratio > 1.2) zone = 'explosion';
      else if (ratio < 0.8) zone = 'decline';
      else zone = 'normal';
    }
    rows.push({
      daysSinceLaunch: p.daysSinceLaunch,
      actual: p.cumulativeViews,
      predicted: null,
      zone,
    });
  }

  // 미래 예측: 단일 기울기로 1~180일까지
  const maxForecast = 180;
  for (let d = 1; d <= maxForecast; d += 7) {
    const futureDay = lastDay + d;
    const predictedViews = lastViews + slope * d;
    rows.push({
      daysSinceLaunch: futureDay,
      actual: null,
      predicted: Math.max(0, predictedViews),
      zone: null,
    });
  }
  // 주요 마일스톤도 삽입
  for (const fd of [30, 90, 180]) {
    const futureDay = lastDay + fd;
    if (rows.some((r) => r.daysSinceLaunch === futureDay)) continue;
    const predictedViews = lastViews + slope * fd;
    rows.push({
      daysSinceLaunch: futureDay,
      actual: null,
      predicted: Math.max(0, predictedViews),
      zone: null,
    });
  }

  rows.sort((a, b) => a.daysSinceLaunch - b.daysSinceLaunch);
  const seen = new Set<number>();
  return rows.filter((r) => {
    if (seen.has(r.daysSinceLaunch)) return false;
    seen.add(r.daysSinceLaunch);
    return true;
  });
}

/* ------------------------------------------------------------------ */
/*  Custom Tooltip Renderers                                           */
/* ------------------------------------------------------------------ */

function Section1Tooltip({
  active,
  payload,
  label,
  fmtViews,
}: {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: Array<{ name: string; value: number; color: string; payload?: any }>;
  label?: string;
  fmtViews: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const views = payload.find((p) => p.name === 'cumulativeViews');
  const delta = payload.find((p) => p.name === 'delta');
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-medium text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-700 pb-1 mb-1">
        {label}
      </p>
      {views && (
        <p style={{ color: views.color }}>
          누적 조회수: {fmtViews(views.value)}
        </p>
      )}
      {delta && delta.value > 0 && (
        <p style={{ color: delta.color }}>
          일일 증가: {fmtViews(delta.value)}
        </p>
      )}
    </div>
  );
}

function Section2Tooltip({
  active,
  payload,
  label,
  fmtViews,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: number;
  fmtViews: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const nameMap: Record<string, string> = {
    top20: '상위 20%',
    top40: '상위 40%',
    top60: '상위 60%',
    top80: '상위 80%',
    myNovel: '내 작품',
  };
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-medium text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-700 pb-1 mb-1">
        경과 {label}일
      </p>
      {payload
        .filter((p) => p.value != null)
        .map((p) => (
          <p key={p.name} style={{ color: p.color }}>
            {nameMap[p.name] || p.name}: {fmtViews(p.value)}
          </p>
        ))}
    </div>
  );
}

function Section3Tooltip({
  active,
  payload,
  label,
  fmtViews,
}: {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: Array<{ name: string; value: number; color: string; payload?: any }>;
  label?: number;
  fmtViews: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const nameMap: Record<string, string> = {
    actual: '실제 조회수',
    predicted: '예측 (최근 7일 기반)',
  };
  const row = payload[0]?.payload as PredictionRow | undefined;
  const zoneLabel = row?.zone === 'explosion' ? '폭발 구간' : null;
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-medium text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-700 pb-1 mb-1">
        경과 {label}일
      </p>
      {payload
        .filter((p) => p.value != null)
        .map((p) => (
          <p key={p.name} style={{ color: p.color }}>
            {nameMap[p.name] || p.name}: {fmtViews(p.value)}
          </p>
        ))}
      {zoneLabel && (
        <p className="mt-1 pt-1 border-t font-medium text-green-600 dark:text-green-400 border-green-100 dark:border-green-800">
          {zoneLabel}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ViewsGrowthPage() {
  const { db } = useDb();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [section2BucketIndex, setSection2BucketIndex] = useState(DEFAULT_BUCKET_INDEX);
  const [periodFilterEnabled, setPeriodFilterEnabled] = useState(false);
  const [launchAfter, setLaunchAfter] = useState('');

  // ---- Base data ----
  const novels = useMemo(() => {
    if (!db) return [];
    return getAllNovels(db);
  }, [db]);

  const selectedNovel = useMemo<ManagementNovel | null>(
    () => novels.find((n) => n.id === selectedId) ?? null,
    [novels, selectedId],
  );

  const stats = useMemo(() => {
    if (!db || !selectedId) return [];
    return getStatsByNovelId(db, selectedId);
  }, [db, selectedId]);

  const platform = useMemo(
    () => normalizePlatform(selectedNovel?.platform),
    [selectedNovel],
  );

  const fmtViews = useMemo(() => makeFormatViews(platform), [platform]);

  // ---- Section 1: Individual views growth ----
  const individualData = useMemo<IndividualPoint[]>(() => {
    if (stats.length === 0) return [];
    const sorted = [...stats].sort((a, b) => a.date.localeCompare(b.date));
    const points: IndividualPoint[] = [];

    // Prepend launch date as day 0 if needed
    const launchDate = selectedNovel?.launch_date;
    if (launchDate && sorted.length > 0 && sorted[0].date > launchDate) {
      points.push({ date: launchDate, cumulativeViews: 0, delta: 0 });
    }

    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i];
      const prev = i > 0 ? sorted[i - 1] : null;
      const delta = prev ? Math.max(0, current.views - prev.views) : 0;
      points.push({
        date: current.date,
        cumulativeViews: current.views,
        delta,
      });
    }
    return points;
  }, [stats, selectedNovel]);

  const section1DateFormatter = useMemo(() => {
    const dates = individualData.map((d) => d.date).sort();
    return makeSmartDateFormatter(dates);
  }, [individualData]);

  // ---- Section 2: Aggregate stats ----
  const aggregate = useMemo(() => {
    if (!db) return null;
    const la = periodFilterEnabled && launchAfter ? launchAfter : undefined;
    return getAggregateStats(db, selectedId ?? undefined, la);
  }, [db, selectedId, periodFilterEnabled, launchAfter]);

  const platformAggregate = useMemo<PlatformAggregate | null>(() => {
    if (!aggregate) return null;
    // Try exact match for selected novel's platform
    if (aggregate.byPlatform[platform]) {
      return aggregate.byPlatform[platform];
    }
    // Partial match
    const match = aggregate.platforms.find(
      (p) => p.includes(platform) || platform.includes(p),
    );
    if (match) return aggregate.byPlatform[match];
    // First available
    if (aggregate.platforms.length > 0) {
      return aggregate.byPlatform[aggregate.platforms[0]];
    }
    return null;
  }, [aggregate, platform]);

  const aggregateChartData = useMemo<AggregateMergedRow[]>(() => {
    if (!platformAggregate) return [];
    return mergePercentileSeries(platformAggregate);
  }, [platformAggregate]);

  const section2BucketDays = BUCKET_DAYS[Math.min(section2BucketIndex, BUCKET_DAYS.length - 1)];

  const section2DisplayData = useMemo<AggregateMergedRow[]>(() => {
    if (aggregateChartData.length === 0) return [];
    return aggregateMergedByBucket(aggregateChartData, section2BucketDays);
  }, [aggregateChartData, section2BucketDays]);

  // ---- Section 3: Prediction ----
  const myNovelSeries = useMemo<SeriesPoint[]>(() => {
    if (!db || !selectedId) return [];
    const novel = selectedNovel;
    if (!novel) return [];
    const novelStats = getStatsByNovelId(db, novel.id);
    if (novelStats.length === 0) return [];
    const { series } = buildNovelSeries(novel.launch_date, novelStats);
    return series;
  }, [db, selectedId, selectedNovel]);

  const predictionData = useMemo<PredictionRow[]>(() => {
    if (myNovelSeries.length < 2) return [];
    return buildPredictionData(myNovelSeries);
  }, [myNovelSeries]);

  // ---- Summary stats for Section 3 ----
  const predictionSummary = useMemo(() => {
    if (predictionData.length === 0) return null;
    const actualRows = predictionData.filter((r) => r.actual != null);
    if (actualRows.length < 2) return null;
    const lastActual = actualRows[actualRows.length - 1];
    const pred30 = predictionData.find(
      (r) => r.predicted != null && r.daysSinceLaunch >= (lastActual.daysSinceLaunch + 28),
    );
    const pred90 = predictionData.find(
      (r) => r.predicted != null && r.daysSinceLaunch >= (lastActual.daysSinceLaunch + 85),
    );
    const pred180 = predictionData.find(
      (r) => r.predicted != null && r.daysSinceLaunch >= (lastActual.daysSinceLaunch + 175),
    );
    return {
      currentViews: lastActual.actual!,
      pred1m: pred30?.predicted ?? null,
      pred3m: pred90?.predicted ?? null,
      pred6m: pred180?.predicted ?? null,
    };
  }, [predictionData]);

  // ---- Render ----
  if (!db) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        DB를 먼저 로드해주세요
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Page title */}
      <div>
        <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
          조회수 상승 그래프
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          개별 성장 + 플랫폼 비교 + 예측
        </p>
      </div>

      {/* Novel selector */}
      <NovelSelector
        novels={novels}
        value={selectedId}
        onChange={setSelectedId}
        label="작품 선택"
      />

      {!selectedId ? (
        <div className="text-center text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-8 text-sm">
          작품을 선택하면 조회수 상승 그래프가 표시됩니다.
        </div>
      ) : (
        <>
          {/* Novel info badge */}
          {selectedNovel && (
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">
                {selectedNovel.title}
              </span>
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                style={{
                  backgroundColor: (PLATFORM_COLORS[platform] || '#6b7280') + '20',
                  color: PLATFORM_COLORS[platform] || '#6b7280',
                }}
              >
                {platform}
              </span>
            </div>
          )}

          {/* ============================================================= */}
          {/* SECTION 1: 개별 작품 조회수 상승                                */}
          {/* ============================================================= */}
          <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-3">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2 flex items-center">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-[10px] font-bold mr-2">
                1
              </span>
              개별 작품 조회수 상승
            </h3>

            {individualData.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">
                일일 지표를 입력하면 조회수 상승 그래프가 표시됩니다.
              </p>
            ) : (
              <>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-2">
                  X축: 날짜 / Y축(좌): 누적 조회수 / Y축(우): 일일 증가분
                </p>
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={individualData}
                      margin={{ top: 5, right: 5, left: 0, bottom: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 9 }}
                        angle={-45}
                        textAnchor="end"
                        height={50}
                        tickFormatter={section1DateFormatter}
                      />
                      <YAxis
                        yAxisId="views"
                        tick={{ fontSize: 9 }}
                        tickFormatter={fmtViews}
                        width={45}
                      />
                      <YAxis
                        yAxisId="delta"
                        orientation="right"
                        tick={{ fontSize: 9 }}
                        tickFormatter={fmtViews}
                        width={40}
                      />
                      <Tooltip
                        content={(props) => (
                          <Section1Tooltip
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            {...(props as any)}
                            fmtViews={fmtViews}
                          />
                        )}
                      />
                      <Area
                        yAxisId="delta"
                        type="monotone"
                        dataKey="delta"
                        name="delta"
                        fill="#93c5fd"
                        fillOpacity={0.4}
                        stroke="#60a5fa"
                        strokeWidth={1}
                      />
                      <Line
                        yAxisId="views"
                        type="monotone"
                        dataKey="cumulativeViews"
                        name="cumulativeViews"
                        stroke="#1d4ed8"
                        strokeWidth={2}
                        dot={{ r: 1.5 }}
                        connectNulls
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                {/* Legend */}
                <div className="flex items-center justify-center gap-4 mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-3 h-0.5 bg-blue-700 rounded" />
                    누적 조회수
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-3 h-2 bg-blue-300/60 rounded-sm" />
                    일일 증가분
                  </span>
                </div>
              </>
            )}
          </section>

          {/* ============================================================= */}
          {/* SECTION 2: 통합 통계 (플랫폼 퍼센타일)                          */}
          {/* ============================================================= */}
          <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-3">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1 flex items-center flex-wrap gap-y-1">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 text-[10px] font-bold mr-2">
                2
              </span>
              {periodFilterEnabled && launchAfter ? (
                <span>
                  기간 통합 통계
                  <span className="ml-1 text-xs text-purple-600 dark:text-purple-400 font-normal">
                    — {launchAfter.split('-')[0]}년 {parseInt(launchAfter.split('-')[1], 10)}월 이후 런칭 작품 비교
                  </span>
                </span>
              ) : (
                <>
                  통합 통계
                  <span className="ml-2 text-xs text-purple-600 dark:text-purple-400 font-normal">
                    [{platform}] 퍼센타일 비교
                  </span>
                </>
              )}
            </h3>

            {/* 기간 필터 UI */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={periodFilterEnabled}
                  onChange={(e) => setPeriodFilterEnabled(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-purple-600 focus:ring-purple-500 dark:bg-slate-700"
                />
                기간 필터
              </label>
              {periodFilterEnabled && (
                <input
                  type="month"
                  value={launchAfter}
                  onChange={(e) => setLaunchAfter(e.target.value)}
                  className="text-xs px-2 py-0.5 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                />
              )}
              {periodFilterEnabled && launchAfter && aggregate && (
                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                  비교 대상: {aggregate.filteredCount}개 작품
                </span>
              )}
            </div>

            {platformAggregate?.percentileTop != null && (
              <p className="text-xs mb-2">
                <span className="text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full font-medium">
                  상위 {platformAggregate.percentileTop}%
                </span>
                <span className="text-slate-400 dark:text-slate-500 ml-2">
                  ({platformAggregate.totalNovels}개 작품 중)
                </span>
              </p>
            )}

            {aggregateChartData.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">
                동일 플랫폼에 여러 작품을 등록하고 일일 지표를 입력하면 통합 통계가 표시됩니다.
              </p>
            ) : (
              <>
                {/* Bucket zoom controls */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    X축: 런칭일 대비 경과일 / Y축: 누적 조회수
                  </p>
                  <div className="flex items-center gap-0.5 border border-slate-300 dark:border-slate-600 rounded overflow-hidden bg-slate-50 dark:bg-slate-700 shrink-0">
                    <span className="px-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                      {section2BucketDays}일
                    </span>
                    <button
                      type="button"
                      onClick={() => setSection2BucketIndex((i) => Math.max(0, i - 1))}
                      disabled={section2BucketIndex <= 0}
                      className="p-1 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-600 hover:bg-slate-100 dark:hover:bg-slate-500 disabled:opacity-40 disabled:pointer-events-none border-r border-slate-300 dark:border-slate-500 text-xs"
                      title="축소 (넓은 단위)"
                    >
                      -
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSection2BucketIndex((i) =>
                          Math.min(BUCKET_DAYS.length - 1, i + 1),
                        )
                      }
                      disabled={section2BucketIndex >= BUCKET_DAYS.length - 1}
                      className="p-1 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-600 hover:bg-slate-100 dark:hover:bg-slate-500 disabled:opacity-40 disabled:pointer-events-none text-xs"
                      title="확대 (촘촘한 단위)"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Legend */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mb-2 text-[10px] text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-0.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" />
                    상위 20%
                  </span>
                  <span className="flex items-center gap-0.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-400" />
                    상위 40%
                  </span>
                  <span className="flex items-center gap-0.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-500" />
                    상위 60%
                  </span>
                  <span className="flex items-center gap-0.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-400" />
                    상위 80%
                  </span>
                  {platformAggregate?.myNovel && (
                    <span className="flex items-center gap-0.5">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500" />
                      내 작품
                    </span>
                  )}
                </div>

                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={section2DisplayData}
                      margin={{ top: 5, right: 5, left: 0, bottom: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="daysSinceLaunch"
                        type="number"
                        tick={{ fontSize: 9 }}
                        label={{
                          value: '경과일',
                          position: 'insideBottom',
                          offset: -12,
                          style: { fontSize: 9 },
                        }}
                      />
                      <YAxis
                        tick={{ fontSize: 9 }}
                        tickFormatter={fmtViews}
                        width={45}
                      />
                      <Tooltip
                        content={(props) => (
                          <Section2Tooltip
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            {...(props as any)}
                            fmtViews={fmtViews}
                          />
                        )}
                      />
                      <Line
                        type="monotone"
                        dataKey="top20"
                        name="top20"
                        stroke="#dc2626"
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="top40"
                        name="top40"
                        stroke="#fb923c"
                        strokeWidth={1.5}
                        dot={false}
                        strokeDasharray="4 2"
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="top60"
                        name="top60"
                        stroke="#eab308"
                        strokeWidth={1.5}
                        dot={false}
                        strokeDasharray="4 2"
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="top80"
                        name="top80"
                        stroke="#9ca3af"
                        strokeWidth={1}
                        dot={false}
                        strokeDasharray="6 3"
                        connectNulls
                      />
                      {platformAggregate?.myNovel && (
                        <Line
                          type="monotone"
                          dataKey="myNovel"
                          name="myNovel"
                          stroke="#16a34a"
                          strokeWidth={2.5}
                          dot={false}
                          connectNulls
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </section>

          {/* ============================================================= */}
          {/* SECTION 3: 예측 성장 추이                                       */}
          {/* ============================================================= */}
          <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-3">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2 flex items-center">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold mr-2">
                3
              </span>
              예측 성장 추이
              <span className="ml-2 text-xs text-slate-500 dark:text-slate-400 font-normal">
                최근 7일 기울기 기반
              </span>
            </h3>

            {predictionData.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">
                예측 그래프를 보려면 작품의 일일 지표가 2일 이상 필요합니다.
              </p>
            ) : (
              <>
                {/* Summary cards */}
                {predictionSummary && (
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-2">
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">현재 조회수</p>
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                        {fmtViews(predictionSummary.currentViews)}
                      </p>
                    </div>
                    {predictionSummary.pred1m != null && (
                      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2">
                        <p className="text-[10px] text-blue-600 dark:text-blue-400">1개월 후 예측</p>
                        <p className="text-sm font-bold text-blue-700 dark:text-blue-300">
                          {fmtViews(predictionSummary.pred1m)}
                        </p>
                      </div>
                    )}
                    {predictionSummary.pred3m != null && (
                      <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2">
                        <p className="text-[10px] text-amber-600 dark:text-amber-400">3개월 후 예측</p>
                        <p className="text-sm font-bold text-amber-700 dark:text-amber-300">
                          {fmtViews(predictionSummary.pred3m)}
                        </p>
                      </div>
                    )}
                    {predictionSummary.pred6m != null && (
                      <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-2">
                        <p className="text-[10px] text-emerald-600 dark:text-emerald-400">6개월 후 예측</p>
                        <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                          {fmtViews(predictionSummary.pred6m)}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Legend */}
                <div className="flex items-center gap-4 mb-2 text-[10px] text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-3 h-0.5 bg-blue-700 rounded" />
                    실제 조회수
                  </span>
                  <span className="flex items-center gap-1">
                    <span
                      className="inline-block w-3 h-0.5 rounded"
                      style={{ borderTop: '2px dashed #f59e0b' }}
                    />
                    예측
                  </span>
                </div>

                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={predictionData}
                      margin={{ top: 5, right: 5, left: 0, bottom: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="daysSinceLaunch"
                        type="number"
                        tick={{ fontSize: 9 }}
                        label={{
                          value: '경과일',
                          position: 'insideBottom',
                          offset: -12,
                          style: { fontSize: 9 },
                        }}
                      />
                      <YAxis
                        tick={{ fontSize: 9 }}
                        tickFormatter={fmtViews}
                        width={45}
                      />
                      <Tooltip
                        content={(props) => (
                          <Section3Tooltip
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            {...(props as any)}
                            fmtViews={fmtViews}
                          />
                        )}
                      />
                      {/* Reference line at actual/predicted boundary */}
                      {(() => {
                        const lastActual = predictionData.filter((r) => r.actual != null);
                        if (lastActual.length > 0) {
                          const boundary = lastActual[lastActual.length - 1].daysSinceLaunch;
                          return (
                            <ReferenceLine
                              x={boundary}
                              stroke="#9ca3af"
                              strokeDasharray="4 4"
                              label={{
                                value: '현재',
                                position: 'top',
                                style: { fontSize: 9, fill: '#6b7280' },
                              }}
                            />
                          );
                        }
                        return null;
                      })()}
                      {/* Actual line (solid) */}
                      <Line
                        type="monotone"
                        dataKey="actual"
                        name="actual"
                        stroke="#1d4ed8"
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                      {/* Prediction line (dashed) */}
                      <Line
                        type="monotone"
                        dataKey="predicted"
                        name="predicted"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        strokeDasharray="6 3"
                        dot={false}
                        connectNulls
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2">
                  예측은 해당 작품의 최근 7일간 조회수 증가 수치로 일일 평균 증가량(기울기)을 계산한 뒤,
                  이 기울기 하나로 선형 외삽합니다.
                </p>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
