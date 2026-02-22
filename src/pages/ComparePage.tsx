/**
 * 다중 작품 비교 (V2) — 최대 3개 작품 성장 곡선 오버레이 + 병렬 그래프
 */
import React, { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useDb } from '../context/DbContext';
import { getNovelsWithLaunchDate, getDailyStats } from '../db/queries';
import { buildNovelSeries } from '../services/aggregateStatsService';
import type { ManagementNovel } from '../db/types';
import type { SeriesPoint } from '../db/types';

const MAX_SELECT = 3;
const COMPARE_COLORS = ['#2563eb', '#16a34a', '#dc2626'];

interface CompareNovel {
  id: number;
  title: string;
  platform: string;
  launch_date: string;
  total_views: number;
  series: SeriesPoint[];
}

function mergeCompareSeries(novels: CompareNovel[]): { daysSinceLaunch: number; [key: string]: number }[] {
  const daySet = new Set<number>();
  novels.forEach((n) => n.series.forEach((p) => daySet.add(p.daysSinceLaunch)));
  const days = Array.from(daySet).sort((a, b) => a - b);
  const maps = novels.map((n) => new Map(n.series.map((p) => [p.daysSinceLaunch, p.cumulativeViews] as [number, number])));
  return days.map((d) => {
    const row: { daysSinceLaunch: number; [key: string]: number } = { daysSinceLaunch: d };
    novels.forEach((n, i) => {
      row[`views_${n.id}`] = maps[i].get(d) ?? 0;
    });
    return row;
  });
}

export function ComparePage() {
  const { db } = useDb();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const novelList = useMemo(() => (db ? getNovelsWithLaunchDate(db) : []), [db]);

  const compareData = useMemo((): CompareNovel[] => {
    if (!db || selectedIds.length === 0) return [];
    const result: CompareNovel[] = [];
    for (const id of selectedIds) {
      const novel = novelList.find((n) => n.id === id);
      if (!novel?.launch_date) continue;
      const stats = getDailyStats(db, id);
      const rows = stats.map((s) => ({ date: s.date, views: Number(s.views) || 0 }));
      const { total, series } = buildNovelSeries(novel.launch_date, rows);
      result.push({
        id: novel.id,
        title: novel.title || '(제목 없음)',
        platform: novel.platform || '',
        launch_date: novel.launch_date,
        total_views: total,
        series,
      });
    }
    return result;
  }, [db, selectedIds, novelList]);

  const chartData = useMemo(() => (compareData.length ? mergeCompareSeries(compareData) : []), [compareData]);

  const toggleNovel = (id: number) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_SELECT) return prev;
      return [...prev, id];
    });
  };

  if (!db) return null;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">🔀 다중 작품 비교</h1>
      <p className="text-gray-600 text-sm">최대 3개 작품을 선택하면 런칭일 기준 성장 곡선을 한 그래프에 겹쳐 보여줍니다.</p>

      <section className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">비교할 작품 선택 (최대 3개)</h2>
        {novelList.length === 0 ? (
          <p className="text-gray-500 text-sm">런칭일이 있는 작품이 없습니다.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {novelList.map((n) => {
              const isSelected = selectedIds.includes(n.id);
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => toggleNovel(n.id)}
                  disabled={!isSelected && selectedIds.length >= MAX_SELECT}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${
                    isSelected ? 'bg-blue-100 border-blue-500 text-blue-800 font-medium' : 'bg-gray-50 border-gray-200 hover:border-gray-300 disabled:opacity-50'
                  }`}
                >
                  [{n.platform || '?'}] {(n.title || '').length > 18 ? (n.title || '').slice(0, 18) + '…' : n.title || '(제목 없음)'}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {compareData.length > 0 && chartData.length > 0 && (
        <>
          <section className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">📈 성장 추이 (합쳐보기)</h2>
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 24, left: 8, bottom: 48 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="daysSinceLaunch" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => `${v}일`} />
                  <YAxis tickFormatter={(v) => (v >= 10000 ? `${(v / 10000).toFixed(0)}만` : String(v))} />
                  <Tooltip formatter={(value: number) => [value >= 10000 ? `${(value / 10000).toFixed(1)}만` : value, '조회수']} labelFormatter={(l) => `경과 ${l}일`} />
                  <Legend />
                  {compareData.map((n, i) => (
                    <Line
                      key={n.id}
                      type="monotone"
                      dataKey={`views_${n.id}`}
                      name={`${n.platform} ${(n.title || '').slice(0, 12)}${(n.title || '').length > 12 ? '…' : ''}`}
                      stroke={COMPARE_COLORS[i % COMPARE_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {compareData.map((n, i) => (
              <div key={n.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="text-sm font-semibold truncate mb-2" style={{ color: COMPARE_COLORS[i % COMPARE_COLORS.length] }}>
                  [{n.platform}] {n.title}
                </h3>
                <div className="h-[200px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={n.series} margin={{ top: 4, right: 8, left: 4, bottom: 36 }}>
                      <CartesianGrid strokeDasharray="2 2" stroke="#f3f4f6" />
                      <XAxis dataKey="daysSinceLaunch" type="number" tickFormatter={(v) => `${v}일`} fontSize={10} />
                      <YAxis tickFormatter={(v) => (v >= 10000 ? `${(v / 10000).toFixed(0)}만` : v)} fontSize={10} width={36} />
                      <Tooltip formatter={(v: number) => [v >= 10000 ? `${(v / 10000).toFixed(1)}만` : v, '조회수']} labelFormatter={(l) => `경과 ${l}일`} />
                      <Line type="monotone" dataKey="cumulativeViews" stroke={COMPARE_COLORS[i % COMPARE_COLORS.length]} strokeWidth={1.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-gray-500 mt-1">총 조회수: {n.total_views >= 10000 ? `${(n.total_views / 10000).toFixed(1)}만` : n.total_views}</p>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
