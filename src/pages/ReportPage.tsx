/**
 * 리포트 — 랭킹 + 급상승 조회수
 */
import { useState, useMemo } from 'react';
import { useDb } from '../hooks/useDb';
import { getRecentRankingDates } from '../db/queries';
import { getTodayReport, getReportByDate, type TodayReport } from '../services/reportService';
import RankingTable from '../components/RankingTable';
import SurgeTable from '../components/SurgeTable';

type Tab = 'ranking' | 'surge';
type SurgePeriod = 'daily' | 'weekly' | 'monthly';

export default function ReportPage() {
  const { db } = useDb();
  const [tab, setTab] = useState<Tab>('ranking');
  const [surgePeriod, setSurgePeriod] = useState<SurgePeriod>('daily');
  const [selectedDate, setSelectedDate] = useState<string>('');

  const dates = useMemo(() => {
    if (!db) return [];
    return getRecentRankingDates(db, 60);
  }, [db]);

  const report: TodayReport | null = useMemo(() => {
    if (!db) return null;
    if (selectedDate) return getReportByDate(db, selectedDate);
    return getTodayReport(db);
  }, [db, selectedDate]);

  if (!db) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        DB를 먼저 로드해주세요
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {/* 날짜 선택 */}
      <div className="flex items-center gap-2">
        <select
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-800 dark:text-slate-200"
        >
          <option value="">최근 수집일</option>
          {dates.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      {report && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {report.date} 기준 리포트
        </p>
      )}

      {/* 탭 */}
      <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
        {(['ranking', 'surge'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${
              tab === t
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 font-semibold shadow-sm'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {t === 'ranking' ? '📊 플랫폼 랭킹' : '🔥 급상승'}
          </button>
        ))}
      </div>

      {/* 콘텐츠 */}
      {report && tab === 'ranking' && (
        <div className="space-y-4">
          {Object.entries(report.rankings).map(([platform, rankings]) => (
            <div key={platform} className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
              <RankingTable
                rankings={rankings}
                platform={platform}
                myNovelIds={report.myNovelIds}
              />
            </div>
          ))}
          {Object.keys(report.rankings).length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">해당 날짜에 랭킹 데이터가 없습니다</p>
          )}
        </div>
      )}

      {report && tab === 'surge' && (
        <div className="space-y-3">
          {/* 기간 선택 */}
          <div className="flex gap-1">
            {([
              ['daily', '전일 대비'],
              ['weekly', '주간'],
              ['monthly', '월간'],
            ] as [SurgePeriod, string][]).map(([period, label]) => (
              <button
                key={period}
                onClick={() => setSurgePeriod(period)}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  surgePeriod === period
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
            <SurgeTable
              items={report.surge[surgePeriod]}
              title={
                surgePeriod === 'daily'
                  ? '전일 대비 급상승'
                  : surgePeriod === 'weekly'
                    ? '주간 급상승'
                    : '월간 급상승'
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
