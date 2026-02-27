/**
 * 문피아 신작 모니터링 리포트 (웹 뷰어 전용 — 조회만)
 * 데스크톱 앱에서 신작 모니터링 수집 후 동기화한 DB를 불러오면 표시됩니다.
 */
import { useMemo, useState } from 'react';
import { useDb } from '../hooks/useDb';
import { getRecentRookieMonitorDates, getLatestRookieMonitorDate } from '../db/queries';
import { getRookieMonitorReport } from '../services/rookieMonitorService';

function formatViews(v: number | null | undefined): string {
  if (v == null) return '-';
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억`;
  if (v >= 10_000) return `${(v / 10_000).toFixed(1)}만`;
  return v.toLocaleString();
}

function formatSurge(surge: number, rate: number): string {
  const s = surge >= 10_000 ? `${(surge / 10_000).toFixed(1)}만` : surge.toLocaleString();
  return `+${s} (${rate.toFixed(1)}%)`;
}

export default function RookieMonitorPage() {
  const { db } = useDb();
  const [selectedDate, setSelectedDate] = useState<string>('');

  const rookieDates = useMemo(() => {
    if (!db) return [];
    return getRecentRookieMonitorDates(db, 30);
  }, [db]);

  const report = useMemo(() => {
    if (!db) return null;
    return getRookieMonitorReport(db, selectedDate || undefined);
  }, [db, selectedDate]);

  const dateOptions = useMemo(() => {
    if (report?.hasData && report.date && rookieDates.length === 0) return [report.date];
    return rookieDates;
  }, [report?.hasData, report?.date, rookieDates]);

  if (!db) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 dark:text-slate-500">
        DB를 먼저 로드해주세요
      </div>
    );
  }

  if (report && !report.hasData) {
    return (
      <div className="p-4 space-y-3">
        <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">🖥️ 문피아 신작 모니터링</h1>
        <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-6 text-center text-slate-600 dark:text-slate-400 text-sm">
          수집된 신작 모니터링 데이터가 없습니다.
          <br />
          데스크톱 앱에서 「문피아 신작 모니터링」 탭 → 「신작 모니터링 수집」 실행 후 DB를 동기화하면 여기서 조회할 수 있습니다.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">🖥️ 문피아 신작 모니터링</h1>
        <select
          value={selectedDate || report?.date || ''}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-800 dark:text-slate-200"
        >
          {dateOptions.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>
      {report && (
        <>
          <p className="text-xs text-slate-500 dark:text-slate-400">{report.date} 기준</p>

          <section className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">오늘 새로 등록된 신인 작품</h2>
            {report.new_rookie_today.length === 0 ? (
              <p className="text-xs text-slate-500">없음</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {report.new_rookie_today.map((item, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-2">
                    <span className="text-slate-400 w-6">{item.rank}</span>
                    <span className="text-slate-800 dark:text-slate-200">{item.title}</span>
                    <span className="text-slate-500">{item.author}</span>
                    {item.novel_url && (
                      <a href={item.novel_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 text-xs">링크</a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">섹션별 급상승 상위 20위</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {Object.entries(report.surge_by_section).map(([key, section]) => (
                <div key={key} className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">{section.label}</h3>
                  {section.items.length === 0 ? (
                    <p className="text-xs text-slate-500">데이터 없음</p>
                  ) : (
                    <ul className="space-y-1 text-xs">
                      {section.items.slice(0, 10).map((item, i) => (
                        <li key={i} className="flex flex-wrap items-baseline gap-1">
                          <span className="text-slate-400 w-4">{i + 1}</span>
                          <span className="text-slate-800 dark:text-slate-200 truncate max-w-[120px]" title={item.title}>{item.title}</span>
                          <span className="text-emerald-600 dark:text-emerald-400 shrink-0">{formatSurge(item.surge, item.surge_rate)}</span>
                          {item.avg_read_through_rate != null && (
                            <span className="text-slate-500 shrink-0">연독 {Number(item.avg_read_through_rate).toFixed(1)}%</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">연독률 TOP 20</h2>
            {report.top20_read_through.length === 0 ? (
              <p className="text-xs text-slate-500">데이터 없음</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {report.top20_read_through.map((item, i) => (
                  <li key={item.novel_id} className="flex flex-wrap items-baseline gap-2">
                    <span className="text-slate-400 w-6">{i + 1}</span>
                    <span className="text-slate-800 dark:text-slate-200">{item.title}</span>
                    <span className="text-slate-500">{item.author}</span>
                    <span className="text-blue-600 dark:text-blue-400 font-medium">
                      연독 {item.avg_read_through_rate != null ? `${Number(item.avg_read_through_rate).toFixed(1)}%` : '—'}
                    </span>
                    {item.views != null && <span className="text-slate-500 text-xs">{formatViews(item.views)}</span>}
                    {item.novel_url && (
                      <a href={item.novel_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 text-xs">링크</a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
