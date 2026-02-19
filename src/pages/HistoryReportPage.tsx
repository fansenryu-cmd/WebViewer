/**
 * 역대 리포트 (Step 9) — 날짜 선택 후 리포트
 */
import React, { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useDb } from '../context/DbContext';
import { getHistoryReport } from '../services/reportService';
import { getAvailableRankingDates } from '../db/queries';

export function HistoryReportPage() {
  const { db } = useDb();
  const dates = useMemo(() => (db ? getAvailableRankingDates(db, 90) : []), [db]);
  const [selectedDate, setSelectedDate] = useState('');

  // dates가 로드되면 첫 번째 날짜 자동 선택
  useEffect(() => {
    if (dates.length > 0 && !selectedDate) {
      setSelectedDate(dates[0]);
    }
  }, [dates, selectedDate]);

  const report = useMemo(() => {
    if (!db || !selectedDate) return null;
    return getHistoryReport(db, selectedDate);
  }, [db, selectedDate]);

  if (!db) return null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">역대 리포트</h1>
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">날짜 선택</label>
        <select
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-w-[200px]"
          aria-label="날짜 선택"
        >
          {dates.length === 0 ? (
            <option value="">— 랭킹 데이터 없음 (데스크톱에서 수집 후 DB 재로드) —</option>
          ) : (
            dates.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))
          )}
        </select>
        {dates.length === 0 && (
          <p className="mt-2 text-sm text-amber-600">
            daily_rankings 테이블에 랭킹 데이터가 없습니다. NovelForge 데스크톱에서 &quot;플랫폼 일간 조회수 수집&quot; 또는 랭킹 수집을 실행한 뒤, 동일 DB 파일을 다시 불러와 주세요.
          </p>
        )}
      </div>

      {report && (
        <>
          <p className="text-gray-600 mb-6">{report.date}</p>

          {Object.entries(report.platform_rankings)
            .filter(([, list]) => list?.length > 0)
            .map(([platform, list]) => (
              <section key={platform} className="mb-8 bg-white rounded-xl shadow p-4 sm:p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-3">
                  {platform.includes('(무료)') ? '📗 ' : platform.includes('(유료)') ? '📕 ' : ''}{platform} TOP 10
                </h2>
                <ul className="divide-y divide-gray-100">
                  {list.map((r, i) => (
                    <li key={i} className="py-2 flex items-center gap-4">
                      <span className="w-8 font-medium text-gray-500">#{r.rank}</span>
                      <span className="flex-1 font-medium text-gray-900">{r.title}</span>
                      <span className="text-sm text-gray-500">
                        {r.author}
                        {r.publisher && <span className="text-gray-400 ml-1">· {r.publisher}</span>}
                      </span>
                      {r.views != null && (
                        <span className="text-sm text-gray-600">{r.views.toLocaleString()}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}

          <SurgeBlock title="일간 성장률" data={report.surge_daily} />
          <SurgeBlock title="주간 성장률" data={report.surge_weekly} />
          <SurgeBlock title="월간 성장률" data={report.surge_monthly} />
        </>
      )}
    </div>
  );
}

function SurgeBlock({
  title,
  data,
}: {
  title: string;
  data: Record<string, import('../services/reportService').SurgeItem[]>;
}) {
  const platforms = Object.keys(data).filter((p) => data[p]?.length > 0);
  if (platforms.length === 0) return null;

  return (
    <section className="mb-8 bg-white rounded-xl shadow p-4 sm:p-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-3">{title}</h2>
      {platforms.map((platform) => (
        <div key={platform} className="mb-4">
          <h3 className="text-sm font-medium text-gray-600 mb-2">{platform}</h3>
          <ul className="space-y-1">
            {data[platform]?.slice(0, 5).map((item, i) => (
              <li key={i} className="flex justify-between py-1">
                <Link to={`/novel/${item.novel_id}`} className="text-blue-600 hover:underline">
                  {item.title}
                </Link>
                <span className="text-sm text-green-600">+{item.surge_rate.toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
