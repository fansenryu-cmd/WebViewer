/**
 * 개별 소설 통계 그래프 — 풍부한 데이터 표시
 * - 누적 조회수 그래프 (넓은 폭)
 * - 일별 조회수 증감 바 차트
 * - 연독률 그래프 (문피아)
 * - 최근 입력 내역 테이블 (조회수, 증감, 연독률)
 */
import React, { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { useDb } from '../context/DbContext';
import { getNovelById, getDailyStats } from '../db/queries';
import type { DailyStatistics } from '../db/types';

/** 조회수를 한국식 만/억 단위로 표시 */
function formatViews(views: number | null | undefined): string {
  if (views == null) return '-';
  if (views >= 100_000_000) return `${(views / 100_000_000).toFixed(1)}억`;
  if (views >= 10_000) return `${(views / 10_000).toFixed(1)}만`;
  return views.toLocaleString();
}

/** detail_data에서 연독률 추출 */
function parseDetailData(detailData: string | null): { readThroughRate: number | null } {
  if (!detailData) return { readThroughRate: null };
  try {
    const dd = JSON.parse(detailData);
    return { readThroughRate: dd?.avg_read_through_rate ?? null };
  } catch {
    return { readThroughRate: null };
  }
}

interface ChartRow {
  date: string;
  views: number;
  delta: number;
  readThroughRate: number | null;
}

export function NovelStatsPage() {
  const { id } = useParams<{ id: string }>();
  const { db } = useDb();
  if (!db || !id) return null;

  const novelId = parseInt(id, 10);
  if (isNaN(novelId)) return null;

  const novel = getNovelById(db, novelId);
  const stats = getDailyStats(db, novelId);

  if (!novel) {
    return (
      <div className="text-gray-600">
        소설을 찾을 수 없습니다. <Link to="/" className="text-blue-600">홈으로</Link>
      </div>
    );
  }

  const chartData: ChartRow[] = useMemo(() => {
    return stats.map((s, i) => {
      const prev = i > 0 ? (stats[i - 1].views ?? 0) : 0;
      const cur = s.views ?? 0;
      const { readThroughRate } = parseDetailData(s.detail_data ?? null);
      return {
        date: s.date,
        views: cur,
        delta: i > 0 ? cur - prev : 0,
        readThroughRate,
      };
    });
  }, [stats]);

  const hasReadThroughRate = chartData.some((d) => d.readThroughRate != null);
  const latestStat = stats[stats.length - 1];
  const prevStat = stats.length >= 2 ? stats[stats.length - 2] : null;
  const latestDelta = latestStat && prevStat ? (latestStat.views ?? 0) - (prevStat.views ?? 0) : null;

  return (
    <div className="max-w-7xl mx-auto">
      {/* 헤더 */}
      <div className="mb-6">
        <Link to="/" className="text-sm text-blue-600 hover:underline mb-2 inline-block">← 홈</Link>
        <h1 className="text-2xl font-bold text-gray-900">{novel.title}</h1>
        <div className="flex flex-wrap items-center gap-3 text-gray-600 mt-1">
          <span>{novel.author || '작가 미상'}</span>
          <span className="text-gray-300">·</span>
          <span>{novel.platform || '플랫폼 미지정'}</span>
          {novel.publisher && (
            <>
              <span className="text-gray-300">·</span>
              <span className="text-sm">{novel.publisher}</span>
            </>
          )}
          {novel.launch_date && (
            <>
              <span className="text-gray-300">·</span>
              <span className="text-sm">런칭 {novel.launch_date}</span>
            </>
          )}
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <SummaryCard
          label="최신 조회수"
          value={formatViews(latestStat?.views)}
          sub={latestStat?.date ?? '-'}
        />
        <SummaryCard
          label="전일 대비"
          value={latestDelta != null ? (latestDelta >= 0 ? `+${formatViews(latestDelta)}` : formatViews(latestDelta)) : '-'}
          sub={latestDelta != null && prevStat?.views ? `${((latestDelta / (prevStat.views || 1)) * 100).toFixed(1)}%` : ''}
          color={latestDelta != null ? (latestDelta > 0 ? 'text-red-500' : latestDelta < 0 ? 'text-blue-500' : '') : ''}
        />
        {hasReadThroughRate && (
          <SummaryCard
            label="연독률"
            value={chartData[chartData.length - 1]?.readThroughRate != null
              ? `${chartData[chartData.length - 1].readThroughRate!.toFixed(1)}%`
              : '-'}
            sub="최신"
          />
        )}
        <SummaryCard
          label="데이터 기간"
          value={stats.length > 0 ? `${stats.length}일` : '-'}
          sub={stats.length > 0 ? `${stats[0].date} ~` : ''}
        />
      </div>

      {/* 누적 조회수 그래프 */}
      <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">📈 누적 조회수</h2>
        <div className="h-80 sm:h-[28rem]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatViews(v)} />
              <Tooltip formatter={(v: number) => [v.toLocaleString(), '조회수']} />
              <Legend />
              <Line
                type="monotone"
                dataKey="views"
                name="누적 조회수"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 일별 증감 바 차트 */}
      {chartData.length > 1 && (
        <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">📊 일별 조회수 증감</h2>
          <div className="h-64 sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData.slice(1)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatViews(v)} />
                <Tooltip formatter={(v: number) => [v.toLocaleString(), '증감']} />
                <ReferenceLine y={0} stroke="#999" />
                <Bar
                  dataKey="delta"
                  name="일별 증감"
                  fill="#60a5fa"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 연독률 그래프 (문피아 등) */}
      {hasReadThroughRate && (
        <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">📖 연독률 추이</h2>
          <div className="h-64 sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData.filter((d) => d.readThroughRate != null)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, '연독률']} />
                <Line
                  type="monotone"
                  dataKey="readThroughRate"
                  name="연독률"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 최근 입력 내역 테이블 */}
      {stats.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">📋 최근 입력 내역</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b bg-gray-50">
                  <th className="text-left px-3 py-2">날짜</th>
                  <th className="text-right px-3 py-2">조회수</th>
                  <th className="text-right px-3 py-2">증감</th>
                  <th className="text-right px-3 py-2">증감률</th>
                  {hasReadThroughRate && <th className="text-right px-3 py-2">연독률</th>}
                </tr>
              </thead>
              <tbody>
                {[...stats].reverse().slice(0, 30).map((s, i, arr) => {
                  const prevIdx = i + 1;
                  const prev = prevIdx < arr.length ? arr[prevIdx] : null;
                  const cur = s.views ?? 0;
                  const prevV = prev?.views ?? 0;
                  const delta = prev ? cur - prevV : null;
                  const rate = delta != null && prevV > 0 ? ((delta / prevV) * 100) : null;
                  const { readThroughRate } = parseDetailData(s.detail_data ?? null);
                  return (
                    <tr key={s.date} className="border-b border-gray-50 last:border-0">
                      <td className="px-3 py-1.5 text-gray-700">{s.date}</td>
                      <td className="px-3 py-1.5 text-right text-gray-800">{formatViews(cur)}</td>
                      <td className="px-3 py-1.5 text-right">
                        {delta != null ? (
                          delta > 0 ? (
                            <span className="text-red-500">+{formatViews(delta)}</span>
                          ) : delta < 0 ? (
                            <span className="text-blue-500">{formatViews(delta)}</span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )
                        ) : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        {rate != null ? (
                          <span className={rate > 0 ? 'text-red-500' : rate < 0 ? 'text-blue-500' : 'text-gray-400'}>
                            {rate > 0 ? '+' : ''}{rate.toFixed(1)}%
                          </span>
                        ) : <span className="text-gray-300">-</span>}
                      </td>
                      {hasReadThroughRate && (
                        <td className="px-3 py-1.5 text-right text-indigo-600">
                          {readThroughRate != null ? `${readThroughRate.toFixed(1)}%` : '-'}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  color = '',
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-4 border">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-lg font-bold ${color || 'text-gray-900'}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}
