/**
 * 에피소드 구조 x 조회수 타임라인 분석
 *
 * 5단계 에피소드 구조(문제설정/획득/위기/해결/보상) x 조회수 변동을 시각화합니다.
 * - 카카오/네이버: 일일 증가분(delta) 기반 연재 추정일 감지
 * - 문피아: 연독률(avg_read_through_rate) 추이 분석
 */
import { useState, useMemo } from 'react';
import {
  ComposedChart,
  Line,
  Bar,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from 'recharts';
import { useDb } from '../hooks/useDb';
import { getAllNovels, getStatsByNovelId } from '../db/queries';
import type { DailyStatistics } from '../db/types';
import NovelSelector from '../components/NovelSelector';
import { normalizePlatform } from '../utils/platform';

// ── 5단계 에피소드 구조 ──

const EPISODE_STAGES = [
  { key: 'problem', label: '문제설정', emoji: '\u2753', color: '#ef4444', desc: '결핍 -- 주인공의 결핍이나 문제가 드러남' },
  { key: 'acquire', label: '획득', emoji: '\uD83D\uDD0D', color: '#f59e0b', desc: '문제 해결책 모색 -- 정보/능력/동료를 얻음' },
  { key: 'crisis', label: '위기', emoji: '\u26A1', color: '#8b5cf6', desc: '역경 -- 새로운 장애물이나 반전이 등장' },
  { key: 'resolve', label: '해결', emoji: '\u2728', color: '#22c55e', desc: '문제를 극복하고 목표를 달성' },
  { key: 'reward', label: '보상', emoji: '\uD83C\uDFC6', color: '#3b82f6', desc: '다음 문제의 전개 준비 -- 새로운 떡밥 배치' },
] as const;

// ── 유틸 ──

/** detail_data JSON에서 avg_read_through_rate 추출 */
function extractReadThroughRate(raw: string | null | undefined): number | null {
  if (!raw) return null;
  try {
    const dd = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (dd && typeof dd.avg_read_through_rate === 'number') return dd.avg_read_through_rate;
  } catch {
    /* ignore */
  }
  return null;
}

/** 조회수 포맷 (만/천 단위) */
function fmtViews(v: number): string {
  if (v >= 10000) return `${(v / 10000).toFixed(1)}만`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}천`;
  return String(Math.round(v));
}

/** 증가분 포맷 (부호 포함) */
function fmtDelta(v: number): string {
  return (v >= 0 ? '+' : '') + fmtViews(v);
}

// ── 타임라인 데이터 포인트 ──

interface TimelinePoint {
  date: string;
  views: number;
  delta: number;
  deltaRate: number;
  readThroughRate: number | null;
  rtrDelta: number | null;
  isPromotion: boolean;
  promotionNote: string | null;
}

/** DailyStatistics[] -> TimelinePoint[] */
function buildTimeline(stats: DailyStatistics[]): TimelinePoint[] {
  if (stats.length === 0) return [];
  const sorted = [...stats].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((s, i) => {
    const prevViews = i > 0 ? sorted[i - 1].views : s.views;
    const delta = s.views - prevViews;
    const deltaRate = prevViews > 0 ? (delta / prevViews) * 100 : 0;
    const rtr = extractReadThroughRate(s.detail_data);
    const prevRtr = i > 0 ? extractReadThroughRate(sorted[i - 1].detail_data) : null;
    const rtrDelta = rtr != null && prevRtr != null ? rtr - prevRtr : null;
    return {
      date: s.date,
      views: s.views,
      delta,
      deltaRate: Math.round(deltaRate * 10) / 10,
      readThroughRate: rtr,
      rtrDelta: rtrDelta != null ? Math.round(rtrDelta * 10) / 10 : null,
      isPromotion: s.promotion_active === 1,
      promotionNote: s.promotion_note || null,
    };
  });
}

/** 연재 추정일 감지 -- 최근 30일 내 평균 증가폭의 1.5배 이상인 날 */
function detectSerializationPeaks(timeline: TimelinePoint[]): string[] {
  if (timeline.length < 3) return [];
  const recent = timeline.slice(-30);
  const avg = recent.reduce((sum, p) => sum + Math.abs(p.delta), 0) / recent.length;
  return recent
    .filter((p) => p.delta > avg * 1.5 && p.delta > 0)
    .map((p) => p.date);
}

/** 통계 요약 */
function computeSummary(timeline: TimelinePoint[]) {
  if (timeline.length < 2) return null;
  const recent7 = timeline.slice(-7);
  const recent30 = timeline.slice(-30);
  const avgDelta7 = recent7.reduce((s, p) => s + p.delta, 0) / recent7.length;
  const avgDelta30 = recent30.reduce((s, p) => s + p.delta, 0) / recent30.length;
  const maxDelta = Math.max(...timeline.map((p) => p.delta));
  const maxDeltaDate = timeline.find((p) => p.delta === maxDelta)?.date || '';
  const rtrValues = timeline.map((p) => p.readThroughRate).filter((v): v is number => v != null);
  const avgRtr = rtrValues.length > 0 ? rtrValues.reduce((s, v) => s + v, 0) / rtrValues.length : null;
  const latestRtr = rtrValues.length > 0 ? rtrValues[rtrValues.length - 1] : null;
  return { avgDelta7, avgDelta30, maxDelta, maxDeltaDate, avgRtr, latestRtr };
}

// ── 메인 컴포넌트 ──

export default function EpisodeAnalyzerPage() {
  const { db } = useDb();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // 소설 목록
  const novels = useMemo(() => {
    if (!db) return [];
    return getAllNovels(db);
  }, [db]);

  // 선택된 소설
  const selectedNovel = useMemo(
    () => novels.find((n) => n.id === selectedId) ?? null,
    [novels, selectedId],
  );

  // 플랫폼 판별
  const platform = selectedNovel ? normalizePlatform(selectedNovel.platform) : '';
  const isMunpia = platform === '문피아';

  // 일일 통계
  const stats = useMemo(() => {
    if (!db || !selectedId) return [];
    return getStatsByNovelId(db, selectedId);
  }, [db, selectedId]);

  // 타임라인 계산
  const timeline = useMemo(() => buildTimeline(stats), [stats]);
  const recentPeaks = useMemo(() => detectSerializationPeaks(timeline), [timeline]);
  const summary = useMemo(() => computeSummary(timeline), [timeline]);

  if (!db) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        DB를 먼저 로드해주세요
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* 페이지 타이틀 */}
      <div>
        <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
          에피소드 구조 x 조회수 타임라인
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          5단계 에피소드 구조와 조회수 변동을 분석합니다
        </p>
      </div>

      {/* 소설 선택 */}
      <NovelSelector
        novels={novels}
        value={selectedId}
        onChange={setSelectedId}
        label="작품 선택"
      />

      {/* 5단계 범례 */}
      <div className="flex flex-wrap gap-1.5">
        {EPISODE_STAGES.map((stage) => (
          <div
            key={stage.key}
            className="flex items-center gap-1 px-2 py-1 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700"
            title={stage.desc}
          >
            <span className="text-sm">{stage.emoji}</span>
            <span className="text-[11px] font-medium" style={{ color: stage.color }}>
              {stage.label}
            </span>
          </div>
        ))}
      </div>

      {/* 선택 안 됨 */}
      {!selectedId && (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 text-center">
          <p className="text-sm text-slate-400 dark:text-slate-500">
            작품을 선택해주세요
          </p>
        </div>
      )}

      {/* 데이터 없음 */}
      {selectedId && timeline.length === 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 text-center">
          <p className="text-sm text-slate-400 dark:text-slate-500">
            일일 지표 데이터가 없습니다
          </p>
        </div>
      )}

      {/* 데이터 있음 */}
      {selectedId && timeline.length > 0 && (
        <>
          {/* 플랫폼별 설명 */}
          <div className="bg-white dark:bg-slate-800 rounded-xl px-3 py-2 shadow-sm border border-slate-200 dark:border-slate-700">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isMunpia
                ? '문피아: 최신 연재편 전후의 연독률 변화를 추적합니다. 연독률이 높을수록 독자 유입이 활발합니다.'
                : '카카오/네이버: 연재 등록일 전후의 조회수 증가폭 변동을 분석합니다. 피크 날짜가 연재 추정일입니다.'}
            </p>
          </div>

          {/* 통계 요약 카드 */}
          {summary && <SummaryCards summary={summary} isMunpia={isMunpia} recentPeaks={recentPeaks} />}

          {/* 메인 차트 */}
          <TimelineChart
            timeline={timeline}
            isMunpia={isMunpia}
            recentPeaks={recentPeaks}
          />

          {/* 최근 14일 데이터 테이블 */}
          <RecentDataTable
            timeline={timeline}
            isMunpia={isMunpia}
            recentPeaks={recentPeaks}
          />
        </>
      )}
    </div>
  );
}

// ── 하위 컴포넌트 ──

/** 통계 요약 카드 */
function SummaryCards({
  summary,
  isMunpia,
  recentPeaks,
}: {
  summary: NonNullable<ReturnType<typeof computeSummary>>;
  isMunpia: boolean;
  recentPeaks: string[];
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-2.5 border border-blue-100 dark:border-blue-900">
        <div className="text-[10px] text-blue-500 dark:text-blue-400 font-medium">7일 평균 증가분</div>
        <div className="text-sm font-bold text-blue-700 dark:text-blue-300">{fmtDelta(summary.avgDelta7)}</div>
      </div>
      <div className="bg-indigo-50 dark:bg-indigo-950/30 rounded-lg p-2.5 border border-indigo-100 dark:border-indigo-900">
        <div className="text-[10px] text-indigo-500 dark:text-indigo-400 font-medium">30일 평균 증가분</div>
        <div className="text-sm font-bold text-indigo-700 dark:text-indigo-300">{fmtDelta(summary.avgDelta30)}</div>
      </div>
      <div className="bg-purple-50 dark:bg-purple-950/30 rounded-lg p-2.5 border border-purple-100 dark:border-purple-900">
        <div className="text-[10px] text-purple-500 dark:text-purple-400 font-medium">최대 증가폭</div>
        <div className="text-sm font-bold text-purple-700 dark:text-purple-300">{fmtDelta(summary.maxDelta)}</div>
        <div className="text-[9px] text-purple-400 dark:text-purple-500">{summary.maxDeltaDate}</div>
      </div>
      {isMunpia && summary.latestRtr != null ? (
        <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-2.5 border border-green-100 dark:border-green-900">
          <div className="text-[10px] text-green-500 dark:text-green-400 font-medium">최근 연독률</div>
          <div className="text-sm font-bold text-green-700 dark:text-green-300">
            {summary.latestRtr.toFixed(1)}%
          </div>
          {summary.avgRtr != null && (
            <div className="text-[9px] text-green-400 dark:text-green-500">
              평균 {summary.avgRtr.toFixed(1)}%
            </div>
          )}
        </div>
      ) : (
        <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-2.5 border border-amber-100 dark:border-amber-900">
          <div className="text-[10px] text-amber-500 dark:text-amber-400 font-medium">연재 추정일</div>
          <div className="text-sm font-bold text-amber-700 dark:text-amber-300">{recentPeaks.length}회</div>
          <div className="text-[9px] text-amber-400 dark:text-amber-500">최근 30일 내 피크</div>
        </div>
      )}
    </div>
  );
}

/** 타임라인 차트 (ComposedChart) */
function TimelineChart({
  timeline,
  isMunpia,
  recentPeaks,
}: {
  timeline: TimelinePoint[];
  isMunpia: boolean;
  recentPeaks: string[];
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
      <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
        {isMunpia ? '조회수 추이 + 연독률 변화' : '조회수 추이 + 일일 증가분'}
      </h4>
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={timeline} margin={{ top: 8, right: 12, left: 4, bottom: 36 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#e2e8f0"
              className="dark:[&>line]:stroke-slate-700"
            />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 9, fill: '#94a3b8' }}
              tickFormatter={(v: string) => v.slice(5)}
              label={{ value: '날짜', position: 'insideBottom', offset: -24, fontSize: 10, fill: '#94a3b8' }}
            />
            <YAxis
              yAxisId="views"
              tick={{ fontSize: 9, fill: '#94a3b8' }}
              tickFormatter={(v: number) => fmtViews(v)}
              width={48}
              label={{ value: '누적 조회수', angle: -90, position: 'insideLeft', fontSize: 9, fill: '#94a3b8' }}
            />
            <YAxis
              yAxisId="delta"
              orientation="right"
              tick={{ fontSize: 9, fill: '#94a3b8' }}
              tickFormatter={(v: number) => (isMunpia ? `${v}%` : fmtViews(v))}
              width={48}
              label={{
                value: isMunpia ? '연독률 (%)' : '일일 증가분',
                angle: 90,
                position: 'insideRight',
                fontSize: 9,
                fill: '#94a3b8',
              }}
            />
            <Tooltip
              contentStyle={{
                fontSize: 11,
                backgroundColor: 'rgba(30,41,59,0.95)',
                border: '1px solid #475569',
                borderRadius: 8,
                color: '#e2e8f0',
              }}
              formatter={(value: number, name: string) => {
                if (name === '누적 조회수') return [fmtViews(value), name];
                if (name === '일일 증가분') return [fmtDelta(value), name];
                if (name === '연독률') return [value != null ? `${value.toFixed(1)}%` : '--', name];
                return [String(value), name];
              }}
              labelFormatter={(label: string) => label}
            />
            <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />

            {/* 프로모션 구간 */}
            {timeline
              .filter((p) => p.isPromotion)
              .map((p, i) => (
                <ReferenceLine
                  key={`promo-${i}`}
                  x={p.date}
                  yAxisId="views"
                  stroke="#f59e0b"
                  strokeDasharray="4 2"
                  strokeWidth={1}
                />
              ))}

            {/* 연재 추정일 마커 (카카오/네이버) */}
            {!isMunpia &&
              recentPeaks.map((d, i) => (
                <ReferenceLine
                  key={`peak-${i}`}
                  x={d}
                  yAxisId="views"
                  stroke="#ef4444"
                  strokeDasharray="6 3"
                  strokeWidth={1.5}
                  label={
                    i === 0
                      ? { value: '연재', position: 'top', fontSize: 9, fill: '#ef4444' }
                      : undefined
                  }
                />
              ))}

            {/* 누적 조회수 영역 */}
            <Area
              yAxisId="views"
              type="monotone"
              dataKey="views"
              name="누적 조회수"
              stroke="#6366f1"
              fill="#eef2ff"
              strokeWidth={2}
              className="dark:[&>path]:fill-indigo-950/40"
            />

            {/* 일일 증가분 바 or 연독률 라인 */}
            {isMunpia ? (
              <Line
                yAxisId="delta"
                type="monotone"
                dataKey="readThroughRate"
                name="연독률"
                stroke="#22c55e"
                strokeWidth={2}
                dot={{ fill: '#22c55e', r: 2 }}
                connectNulls
              />
            ) : (
              <Bar
                yAxisId="delta"
                dataKey="delta"
                name="일일 증가분"
                fill="#a5b4fc"
                opacity={0.6}
                barSize={6}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** 최근 14일 데이터 테이블 */
function RecentDataTable({
  timeline,
  isMunpia,
  recentPeaks,
}: {
  timeline: TimelinePoint[];
  isMunpia: boolean;
  recentPeaks: string[];
}) {
  const recent14 = timeline.slice(-14).reverse();

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
      <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
        최근 데이터 (최신 14일)
      </h4>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 dark:bg-slate-900">
            <tr className="text-slate-500 dark:text-slate-400">
              <th className="py-1.5 px-2 text-left font-medium">날짜</th>
              <th className="py-1.5 px-2 text-right font-medium">조회수</th>
              <th className="py-1.5 px-2 text-right font-medium">증가분</th>
              <th className="py-1.5 px-2 text-right font-medium">증가율</th>
              {isMunpia && <th className="py-1.5 px-2 text-right font-medium">연독률</th>}
              {isMunpia && <th className="py-1.5 px-2 text-right font-medium">변화</th>}
              <th className="py-1.5 px-2 text-center font-medium">비고</th>
            </tr>
          </thead>
          <tbody>
            {recent14.map((p, i) => {
              const isHigh = p.delta > 0 && recentPeaks.includes(p.date);
              return (
                <tr
                  key={i}
                  className={`border-b border-slate-100 dark:border-slate-700 ${
                    isHigh
                      ? 'bg-red-50 dark:bg-red-950/20'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <td className="py-1.5 px-2 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    {p.date.slice(5)}
                  </td>
                  <td className="py-1.5 px-2 text-right text-slate-700 dark:text-slate-300">
                    {fmtViews(p.views)}
                  </td>
                  <td
                    className={`py-1.5 px-2 text-right font-medium ${
                      p.delta > 0
                        ? 'text-red-500'
                        : p.delta < 0
                          ? 'text-blue-500'
                          : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {fmtDelta(p.delta)}
                  </td>
                  <td
                    className={`py-1.5 px-2 text-right ${
                      p.deltaRate > 0
                        ? 'text-red-400'
                        : p.deltaRate < 0
                          ? 'text-blue-400'
                          : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {p.deltaRate > 0 ? '+' : ''}
                    {p.deltaRate}%
                  </td>
                  {isMunpia && (
                    <td className="py-1.5 px-2 text-right text-green-600 dark:text-green-400">
                      {p.readThroughRate != null ? `${p.readThroughRate.toFixed(1)}%` : '--'}
                    </td>
                  )}
                  {isMunpia && (
                    <td
                      className={`py-1.5 px-2 text-right font-medium ${
                        p.rtrDelta != null && p.rtrDelta > 0
                          ? 'text-red-500'
                          : p.rtrDelta != null && p.rtrDelta < 0
                            ? 'text-blue-500'
                            : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {p.rtrDelta != null ? `${p.rtrDelta > 0 ? '+' : ''}${p.rtrDelta}%p` : '--'}
                    </td>
                  )}
                  <td className="py-1.5 px-2 text-center whitespace-nowrap">
                    {isHigh && (
                      <span className="text-red-500" title="연재 추정일">
                        연재
                      </span>
                    )}
                    {p.isPromotion && (
                      <span className="text-amber-500 ml-1" title={p.promotionNote || '프로모션'}>
                        프로모
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
