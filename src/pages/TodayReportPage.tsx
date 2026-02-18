/**
 * 투데이 리포트 — 풍부한 데이터 표시
 * - 플랫폼별 TOP 10 랭킹 (조회수 포함)
 * - 소설별 최신 조회수, 전날 대비 증감, 연독률
 * - 일간/주간/월간 성장률 (수치별/%별 정렬 토글)
 */
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDb } from '../context/DbContext';
import { getTodayReport } from '../services/reportService';
import type { TodayReportData, SurgeItem } from '../services/reportService';

/** 조회수를 한국식 만/억 단위로 표시 */
function formatViews(views: number | null | undefined): string {
  if (views == null) return '-';
  if (views >= 100_000_000) return `${(views / 100_000_000).toFixed(1)}억`;
  if (views >= 10_000) return `${(views / 10_000).toFixed(1)}만`;
  return views.toLocaleString();
}

const PLATFORM_COLORS: Record<string, string> = {
  '네이버시리즈': 'border-l-4 border-l-green-500',
  '카카오페이지': 'border-l-4 border-l-yellow-500',
  '문피아': 'border-l-4 border-l-blue-500',
  '문피아(무료)': 'border-l-4 border-l-blue-400',
  '문피아(유료)': 'border-l-4 border-l-blue-600',
  '리디': 'border-l-4 border-l-purple-500',
  '노벨피아': 'border-l-4 border-l-orange-500',
};

export function TodayReportPage() {
  const { db } = useDb();
  const report = useMemo((): TodayReportData | null => {
    if (!db) return null;
    return getTodayReport(db);
  }, [db]);

  if (!report) return null;

  const platforms = Object.keys(report.platform_rankings).filter(
    (p) => report.platform_rankings[p]?.length > 0,
  );

  const todayStr = new Date().toISOString().slice(0, 10);
  const isFallbackDate = report.date !== todayStr;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">투데이 리포트</h1>
        <p className="text-gray-600">
          {report.date}
          {isFallbackDate && (
            <span className="ml-2 text-sm text-amber-600">(오늘 데이터 없음 — 최신 데이터 사용)</span>
          )}
        </p>
      </div>

      {/* 플랫폼별 투데이 랭킹 TOP 10 */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-800 mb-1">🏆 플랫폼별 투데이 랭킹 TOP 10</h2>
        <p className="text-sm text-gray-500 mb-4">각 플랫폼 일간 랭킹 상위 10위</p>

        {platforms.length === 0 ? (
          <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-500">
            {report.date} 기준 랭킹 데이터가 없습니다.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {platforms.map((platform) => (
              <div key={platform} className={`bg-white rounded-xl shadow-sm p-4 ${PLATFORM_COLORS[platform] || 'border-l-4 border-l-gray-300'}`}>
                <h3 className="text-base font-semibold text-gray-800 mb-3">{platform}</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b">
                      <th className="w-8 text-center pb-1">#</th>
                      <th className="text-left pb-1">제목</th>
                      <th className="text-right pb-1">조회수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.platform_rankings[platform]?.map((r, i) => (
                      <tr key={i} className="border-b border-gray-50 last:border-0">
                        <td className="py-1.5 text-center font-bold text-gray-400">{r.rank}</td>
                        <td className="py-1.5">
                          <div className="font-medium text-gray-900 truncate max-w-[220px]">{r.title}</div>
                          <div className="text-xs text-gray-500 truncate">
                            {r.author}
                            {r.publisher && <span className="text-gray-400"> · {r.publisher}</span>}
                          </div>
                        </td>
                        <td className="py-1.5 text-right text-gray-600 whitespace-nowrap text-xs">
                          {r.views != null ? formatViews(r.views) : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 일간/주간/월간 Surge (수치별/%별 정렬 선택 가능) */}
      <SurgeSection title="📈 일간 급상승" subtitle="전일 대비 조회수 증가" data={report.surge_daily} mode="daily" />
      <SurgeSection title="📊 주간 급상승" subtitle="주간 조회수 증가" data={report.surge_weekly} mode="weekly" />
      <SurgeSection title="📉 월간 급상승" subtitle="월간 조회수 증가" data={report.surge_monthly} mode="monthly" />
    </div>
  );
}

type SurgeSortMode = 'percent' | 'value';

function SurgeSection({
  title,
  subtitle,
  data,
  mode,
}: {
  title: string;
  subtitle: string;
  data: Record<string, SurgeItem[]>;
  mode: 'daily' | 'weekly' | 'monthly';
}) {
  const [sortMode, setSortMode] = useState<SurgeSortMode>('percent');
  const platforms = Object.keys(data).filter((p) => data[p]?.length > 0);
  if (platforms.length === 0) return null;

  const getSortedList = (list: SurgeItem[]) => {
    const copy = [...list];
    if (sortMode === 'percent') {
      copy.sort((a, b) => (b.surge_rate ?? 0) - (a.surge_rate ?? 0));
    } else {
      copy.sort((a, b) => (b.surge ?? 0) - (a.surge ?? 0));
    }
    return copy.slice(0, 10);
  };

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between gap-4 mb-1">
        <h2 className="text-xl font-semibold text-gray-800">{title}</h2>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">정렬:</span>
          <button
            type="button"
            onClick={() => setSortMode('percent')}
            className={`px-2 py-1 rounded ${sortMode === 'percent' ? 'bg-green-100 text-green-800 font-medium' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            증가율(%)
          </button>
          <button
            type="button"
            onClick={() => setSortMode('value')}
            className={`px-2 py-1 rounded ${sortMode === 'value' ? 'bg-green-100 text-green-800 font-medium' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            수치별
          </button>
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-4">{subtitle}</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {platforms.map((platform) => (
          <div key={platform} className={`bg-white rounded-xl shadow-sm p-4 ${PLATFORM_COLORS[platform] || ''}`}>
            <h3 className="text-base font-semibold text-gray-800 mb-3">{platform}</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b">
                  <th className="text-left pb-1">소설</th>
                  <th className="text-right pb-1">이전</th>
                  <th className="text-right pb-1">현재</th>
                  <th className="text-right pb-1">증가율</th>
                </tr>
              </thead>
              <tbody>
                {getSortedList(data[platform] ?? []).map((item, i) => {
                  const prevViews = mode === 'daily' ? item.yesterday_views
                    : mode === 'weekly' ? item.last_week_views
                    : item.last_month_views;
                  const curViews = mode === 'daily' ? item.today_views
                    : mode === 'weekly' ? item.this_week_views
                    : item.this_month_views;
                  return (
                    <tr key={i} className="border-b border-gray-50 last:border-0">
                      <td className="py-1.5">
                        <Link to={`/novel/${item.novel_id}`} className="font-medium text-blue-600 hover:underline truncate block max-w-[200px]">
                          {item.title}
                        </Link>
                        <div className="text-xs text-gray-500">
                          {item.author}
                          {item.avg_read_through_rate != null && (
                            <span className="ml-1 text-indigo-500">연독 {item.avg_read_through_rate.toFixed(1)}%</span>
                          )}
                        </div>
                      </td>
                      <td className="py-1.5 text-right text-gray-500 text-xs whitespace-nowrap">{formatViews(prevViews)}</td>
                      <td className="py-1.5 text-right text-gray-800 text-xs whitespace-nowrap">{formatViews(curViews)}</td>
                      <td className="py-1.5 text-right">
                        <span className="text-xs text-green-600 font-medium">+{item.surge_rate.toFixed(1)}%</span>
                        <div className="text-xs text-gray-500">+{formatViews(item.surge)}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </section>
  );
}
