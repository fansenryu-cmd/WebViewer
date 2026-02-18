/**
 * 통합 통계 (5-tier 퍼센타일) (Step 10)
 */
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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
import { getAggregateStats } from '../services/aggregateStatsService';
import { getAllNovels } from '../db/queries';
import type { ManagementNovel } from '../db/types';

/** 플랫폼별 그룹 후, 플랫폼 순서 고정 + 소설 제목 가나다순 */
const PLATFORM_ORDER = ['네이버시리즈', '카카오페이지', '문피아', '리디북스', '리디', '노벨피아'];
function novelsGroupedAndSorted(novels: ManagementNovel[]): ManagementNovel[] {
  const byPlatform: Record<string, ManagementNovel[]> = {};
  for (const p of PLATFORM_ORDER) byPlatform[p] = [];
  for (const n of novels) {
    const key = (n.platform?.trim() || '미지정');
    if (!byPlatform[key]) byPlatform[key] = [];
    byPlatform[key].push(n);
  }
  const out: ManagementNovel[] = [];
  for (const p of PLATFORM_ORDER) {
    const list = byPlatform[p] ?? [];
    list.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? '', 'ko'));
    out.push(...list);
  }
  for (const key of Object.keys(byPlatform)) {
    if (PLATFORM_ORDER.includes(key)) continue;
    const list = byPlatform[key];
    list.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? '', 'ko'));
    out.push(...list);
  }
  return out;
}

const COLORS = {
  top20: '#059669',
  top40: '#0ea5e9',
  top60: '#8b5cf6',
  top80: '#f59e0b',
  myNovel: '#ef4444',
};

export function AggregateStatsPage() {
  const { db } = useDb();
  const [selectedNovelId, setSelectedNovelId] = useState<number | null>(null);

  const novels = useMemo(() => {
    if (!db) return [];
    return novelsGroupedAndSorted(getAllNovels(db));
  }, [db]);
  const agg = useMemo(() => {
    if (!db) return null;
    return getAggregateStats(db, selectedNovelId ?? undefined);
  }, [db, selectedNovelId]);

  if (!db) return null;

  return (
    <div className="max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">📈 통합 통계 (5-tier 퍼센타일)</h1>
      <p className="text-gray-600 mb-6">
        플랫폼별 상위 20/40/60/80% 소설의 중앙값 시계열. 내 소설 비교용 선택 가능.
      </p>

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">내 소설 선택 (비교용)</label>
        <select
          value={selectedNovelId ?? ''}
          onChange={(e) => setSelectedNovelId(e.target.value ? Number(e.target.value) : null)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="">— 선택 안 함 —</option>
          {novels.map((n) => (
            <option key={n.id} value={n.id}>
              {n.title} ({n.platform || '미지정'})
            </option>
          ))}
        </select>
      </div>

      {agg?.platforms.map((platform) => {
        const data = agg.byPlatform[platform];
        if (!data || !data.top20.length) return null;

        const chartData = mergeSeries(data);
        return (
          <section key={platform} className="mb-10 bg-white rounded-xl shadow p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-2">{platform}</h2>
            {data.percentileTop != null && (
              <p className="text-sm text-gray-600 mb-3">
                내 소설 퍼센타일: 상위 {data.percentileTop}% (전체 {data.totalNovels}개 중)
              </p>
            )}
            <div className="h-80 sm:h-[28rem] lg:h-[32rem]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="daysSinceLaunch" name="경과일" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 'auto']} tick={{ fontSize: 11 }} tickFormatter={(v) => (v / 10000).toFixed(0) + '만'} />
                  <Tooltip
                    formatter={(v) => (v != null ? Number(v).toLocaleString() : '-')}
                    labelFormatter={(l) => `경과 ${l}일`}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="top20" name="Top 20%" stroke={COLORS.top20} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="top40" name="Top 40%" stroke={COLORS.top40} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="top60" name="Top 60%" stroke={COLORS.top60} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="top80" name="Top 80%" stroke={COLORS.top80} strokeWidth={2} dot={false} />
                  {data.myNovel && data.myNovel.length > 0 && (
                    <Line type="monotone" dataKey="myNovel" name="내 소설" stroke={COLORS.myNovel} strokeWidth={2} strokeDasharray="5 5" dot={false} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        );
      })}
    </div>
  );
}

const CHART_KEYS = ['top20', 'top40', 'top60', 'top80', 'myNovel'] as const;

/** 5-tier + myNovel 시리즈를 하나의 chartData로 병합. 0일 0조회수, 빈 구간은 전일 값 유지로 완전 시계열 */
function mergeSeries(data: import('../services/aggregateStatsService').PlatformAggregateData) {
  const byDay: Record<number, Record<string, number>> = {};
  const add = (key: string, pts: Array<{ daysSinceLaunch: number; cumulativeViews: number }>) => {
    for (const p of pts) {
      if (!byDay[p.daysSinceLaunch]) byDay[p.daysSinceLaunch] = {};
      byDay[p.daysSinceLaunch][key] = p.cumulativeViews;
    }
  };
  add('top20', data.top20);
  add('top40', data.top40);
  add('top60', data.top60);
  add('top80', data.top80);
  if (data.myNovel?.length) add('myNovel', data.myNovel);

  const days = Object.keys(byDay).map(Number).sort((a, b) => a - b);
  if (days.length === 0) return [];

  const minDay = Math.min(0, ...days);
  const maxDay = Math.max(...days);
  const chartData: Array<Record<string, number>> = [];
  const prev: Record<string, number> = { top20: 0, top40: 0, top60: 0, top80: 0, myNovel: 0 };

  for (let d = minDay; d <= maxDay; d++) {
    const row: Record<string, number> = { daysSinceLaunch: d };
    for (const k of CHART_KEYS) {
      if (d in byDay && byDay[d][k] != null) {
        const v = byDay[d][k];
        prev[k] = v;
        row[k] = v;
      } else {
        row[k] = prev[k];
      }
    }
    chartData.push(row);
  }
  return chartData;
}
