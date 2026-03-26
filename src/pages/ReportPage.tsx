/**
 * 리포트 — 랭킹 + 급상승 조회수 (데스크톱 품질)
 */
import { useState, useMemo, useCallback } from 'react';
import { useDb } from '../hooks/useDb';
import { getRecentRankingDates, getRankingsByDate, getPreviousRankingDate } from '../db/queries';
import { getTodayReport, getReportByDate, type TodayReport } from '../services/reportService';
import type { DailyRanking, SurgeItem } from '../db/types';
import { normalizePlatform, PLATFORM_COLORS } from '../utils/platform';
import PlatformBadge from '../components/PlatformBadge';

type Tab = 'ranking' | 'surge' | 'new-entries';
type SurgePeriod = 'daily' | 'weekly' | 'monthly';
type SurgeSort = 'absolute' | 'percent';

/** 랭킹 변동 정보 */
interface RankChange {
  type: 'NEW' | 'UP' | 'DOWN' | 'SAME';
  diff: number; // 양수 = 상승(순위 개선), 음수 = 하락
}

function formatViews(v: number | null): string {
  if (v === null || v === undefined) return '-';
  if (v >= 10000) return `${(v / 10000).toFixed(1)}만`;
  return v.toLocaleString();
}

/** 이전 날짜 랭킹과 비교하여 변동 정보 계산 */
function computeRankChanges(
  currentRankings: DailyRanking[],
  prevRankings: DailyRanking[],
): Map<string, RankChange> {
  const changes = new Map<string, RankChange>();

  // 이전 랭킹을 platform+title 키로 인덱싱
  const prevMap = new Map<string, number>();
  for (const r of prevRankings) {
    const key = `${normalizePlatform(r.platform)}::${r.title}`;
    // 같은 작품이 여러 ranking_type에 있을 수 있으므로 최고 순위 사용
    const existing = prevMap.get(key);
    if (existing === undefined || r.rank < existing) {
      prevMap.set(key, r.rank);
    }
  }

  for (const r of currentRankings) {
    const key = `${normalizePlatform(r.platform)}::${r.title}`;
    const prevRank = prevMap.get(key);

    if (prevRank === undefined) {
      changes.set(`${r.id}`, { type: 'NEW', diff: 0 });
    } else if (r.rank < prevRank) {
      changes.set(`${r.id}`, { type: 'UP', diff: prevRank - r.rank });
    } else if (r.rank > prevRank) {
      changes.set(`${r.id}`, { type: 'DOWN', diff: prevRank - r.rank });
    } else {
      changes.set(`${r.id}`, { type: 'SAME', diff: 0 });
    }
  }

  return changes;
}

/** 신규 진입 작품 계산 (이전 날짜에 없던 작품) */
function computeNewEntries(
  currentRankings: DailyRanking[],
  prevRankings: DailyRanking[],
): DailyRanking[] {
  const prevTitles = new Set<string>();
  for (const r of prevRankings) {
    prevTitles.add(`${normalizePlatform(r.platform)}::${r.title}`);
  }

  const seen = new Set<string>();
  const newEntries: DailyRanking[] = [];
  for (const r of currentRankings) {
    const key = `${normalizePlatform(r.platform)}::${r.title}`;
    if (!prevTitles.has(key) && !seen.has(key)) {
      seen.add(key);
      newEntries.push(r);
    }
  }
  return newEntries;
}

/** 변동 뱃지 컴포넌트 */
function RankChangeBadge({ change }: { change: RankChange | undefined }) {
  if (!change) return <span className="text-slate-400 text-[10px]">-</span>;

  switch (change.type) {
    case 'NEW':
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400">
          NEW
        </span>
      );
    case 'UP':
      return (
        <span className="text-[10px] font-semibold text-red-500 dark:text-red-400">
          ▲{change.diff}
        </span>
      );
    case 'DOWN':
      return (
        <span className="text-[10px] font-semibold text-blue-500 dark:text-blue-400">
          ▼{Math.abs(change.diff)}
        </span>
      );
    case 'SAME':
      return <span className="text-[10px] text-slate-400">—</span>;
  }
}

/** Surge 정렬 토글 */
function SurgeSortToggle({
  value,
  onChange,
}: {
  value: SurgeSort;
  onChange: (v: SurgeSort) => void;
}) {
  return (
    <div className="inline-flex bg-slate-100 dark:bg-slate-700 rounded-full p-0.5 text-[10px]">
      <button
        onClick={() => onChange('absolute')}
        className={`px-2.5 py-1 rounded-full transition-colors ${
          value === 'absolute'
            ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 font-semibold shadow-sm'
            : 'text-slate-500 dark:text-slate-400'
        }`}
      >
        수치
      </button>
      <button
        onClick={() => onChange('percent')}
        className={`px-2.5 py-1 rounded-full transition-colors ${
          value === 'percent'
            ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 font-semibold shadow-sm'
            : 'text-slate-500 dark:text-slate-400'
        }`}
      >
        %
      </button>
    </div>
  );
}

export default function ReportPage() {
  const { db } = useDb();
  const [tab, setTab] = useState<Tab>('ranking');
  const [surgePeriod, setSurgePeriod] = useState<SurgePeriod>('daily');
  const [surgeSort, setSurgeSort] = useState<SurgeSort>('absolute');
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

  // 이전 날짜 랭킹 데이터
  const prevDateData = useMemo(() => {
    if (!db || !report) return { prevDate: null, prevRankings: [] as DailyRanking[] };
    const prevDate = getPreviousRankingDate(db, report.date);
    const prevRankings = prevDate ? getRankingsByDate(db, prevDate) : [];
    return { prevDate, prevRankings };
  }, [db, report]);

  // 현재 날짜의 전체 랭킹 (플랫폼 미분류)
  const allCurrentRankings = useMemo(() => {
    if (!report) return [];
    return Object.values(report.rankings).flat();
  }, [report]);

  // 랭킹 변동 맵
  const rankChanges = useMemo(() => {
    return computeRankChanges(allCurrentRankings, prevDateData.prevRankings);
  }, [allCurrentRankings, prevDateData.prevRankings]);

  // 신규 진입 작품
  const newEntries = useMemo(() => {
    return computeNewEntries(allCurrentRankings, prevDateData.prevRankings);
  }, [allCurrentRankings, prevDateData.prevRankings]);

  // 신규 진입 작품을 플랫폼별로 그룹
  const newEntriesByPlatform = useMemo(() => {
    const grouped: Record<string, DailyRanking[]> = {};
    for (const r of newEntries) {
      const p = normalizePlatform(r.platform);
      if (!grouped[p]) grouped[p] = [];
      grouped[p].push(r);
    }
    return grouped;
  }, [newEntries]);

  // 요약 통계
  const summaryStats = useMemo(() => {
    const totalRankings = allCurrentRankings.length;
    const newCount = newEntries.length;
    const surgeCount = report ? report.surge.daily.filter((s) => s.surge_rate > 50).length : 0;
    return { totalRankings, newCount, surgeCount };
  }, [allCurrentRankings, newEntries, report]);

  // 정렬된 surge 데이터
  const sortedSurgeItems = useCallback(
    (items: SurgeItem[]): SurgeItem[] => {
      const copy = [...items];
      if (surgeSort === 'percent') {
        copy.sort((a, b) => b.surge_rate - a.surge_rate);
      } else {
        copy.sort((a, b) => b.surge - a.surge);
      }
      return copy;
    },
    [surgeSort],
  );

  if (!db) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        DB를 먼저 로드해주세요
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {/* 그라데이션 헤더 */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-4 text-white">
        <h1 className="text-lg font-bold">투데이 리포트</h1>
        {report && (
          <p className="text-sm text-blue-100 mt-0.5">{report.date} 기준</p>
        )}
        {prevDateData.prevDate && (
          <p className="text-xs text-blue-200 mt-0.5">
            이전 수집일: {prevDateData.prevDate}
          </p>
        )}
      </div>

      {/* 날짜 선택 */}
      <select
        value={selectedDate}
        onChange={(e) => setSelectedDate(e.target.value)}
        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-800 dark:text-slate-200"
      >
        <option value="">최근 수집일</option>
        {dates.map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>

      {/* 요약 통계 바 */}
      {report && (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-2.5 text-center border border-slate-200 dark:border-slate-700">
            <div className="text-lg font-bold text-slate-800 dark:text-slate-100">
              {summaryStats.totalRankings}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400">총 랭킹</div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg p-2.5 text-center border border-slate-200 dark:border-slate-700">
            <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
              {summaryStats.newCount}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400">신규 진입</div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg p-2.5 text-center border border-slate-200 dark:border-slate-700">
            <div className="text-lg font-bold text-orange-600 dark:text-orange-400">
              {summaryStats.surgeCount}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400">급상승 (50%+)</div>
          </div>
        </div>
      )}

      {/* 탭 */}
      <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
        {([
          ['ranking', '📊 플랫폼 랭킹'],
          ['surge', '🔥 급상승'],
          ['new-entries', '🆕 신규 진입'],
        ] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${
              tab === t
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 font-semibold shadow-sm'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {label}
            {t === 'new-entries' && (
              <span className="ml-1 text-[10px] bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 px-1 rounded">
                {summaryStats.newCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 랭킹 탭 */}
      {report && tab === 'ranking' && (
        <div className="space-y-4">
          {Object.entries(report.rankings).map(([platform, rankings]) => {
            const color = PLATFORM_COLORS[normalizePlatform(platform)] || '#9ca3af';
            return (
              <div
                key={platform}
                className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden"
              >
                {/* 플랫폼 컬러 좌측 보더 */}
                <div className="flex">
                  <div className="w-1 flex-shrink-0" style={{ backgroundColor: color }} />
                  <div className="flex-1 p-3">
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full inline-block"
                        style={{ backgroundColor: color }}
                      />
                      {platform}
                      <span className="text-xs text-slate-400 font-normal">
                        ({rankings.length}개)
                      </span>
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-700">
                            <th className="text-center py-1.5 px-1 text-slate-500 w-8">순위</th>
                            <th className="text-center py-1.5 px-1 text-slate-500 w-10">변동</th>
                            <th className="text-left py-1.5 px-2 text-slate-500">제목</th>
                            <th className="text-left py-1.5 px-2 text-slate-500">작가</th>
                            <th className="text-right py-1.5 px-2 text-slate-500">조회수</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rankings.map((r) => {
                            const isMine =
                              r.novel_id !== null && report.myNovelIds.includes(r.novel_id);
                            const change = rankChanges.get(`${r.id}`);
                            return (
                              <tr
                                key={r.id}
                                className={`border-b border-slate-100 dark:border-slate-800 ${
                                  isMine
                                    ? 'bg-blue-50 dark:bg-blue-900/30 font-semibold'
                                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                }`}
                              >
                                <td className="py-1.5 px-1 text-center text-slate-500">
                                  {r.rank}
                                </td>
                                <td className="py-1.5 px-1 text-center">
                                  <RankChangeBadge change={change} />
                                </td>
                                <td className="py-1.5 px-2 text-slate-800 dark:text-slate-200 max-w-[140px] truncate">
                                  {isMine && (
                                    <span className="text-blue-500 mr-1">★</span>
                                  )}
                                  {r.title}
                                </td>
                                <td className="py-1.5 px-2 text-slate-500 dark:text-slate-400 max-w-[70px] truncate">
                                  {r.author || '-'}
                                </td>
                                <td className="py-1.5 px-2 text-right text-slate-600 dark:text-slate-300">
                                  {formatViews(r.views)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {Object.keys(report.rankings).length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">
              해당 날짜에 랭킹 데이터가 없습니다
            </p>
          )}
        </div>
      )}

      {/* 급상승 탭 */}
      {report && tab === 'surge' && (
        <div className="space-y-3">
          {/* 기간 선택 + 정렬 토글 */}
          <div className="flex items-center justify-between">
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
            <SurgeSortToggle value={surgeSort} onChange={setSurgeSort} />
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
            <EnhancedSurgeTable
              items={sortedSurgeItems(report.surge[surgePeriod])}
              title={
                surgePeriod === 'daily'
                  ? '전일 대비 급상승'
                  : surgePeriod === 'weekly'
                    ? '주간 급상승'
                    : '월간 급상승'
              }
              sortMode={surgeSort}
            />
          </div>
        </div>
      )}

      {/* 신규 진입 탭 */}
      {report && tab === 'new-entries' && (
        <div className="space-y-3">
          {prevDateData.prevDate ? (
            <>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {prevDateData.prevDate} 대비 오늘 새롭게 수집된 랭킹 자료
              </p>
              {Object.keys(newEntriesByPlatform).length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">
                  신규 진입 작품이 없습니다
                </p>
              ) : (
                Object.entries(newEntriesByPlatform).map(([platform, entries]) => {
                  const color =
                    PLATFORM_COLORS[normalizePlatform(platform)] || '#9ca3af';
                  return (
                    <div
                      key={platform}
                      className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden"
                    >
                      <div className="flex">
                        <div
                          className="w-1 flex-shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <div className="flex-1 p-3">
                          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full inline-block"
                              style={{ backgroundColor: color }}
                            />
                            {platform}
                            <span className="text-xs text-slate-400 font-normal">
                              ({entries.length}개)
                            </span>
                          </h3>
                          <div className="grid grid-cols-1 gap-1.5">
                            {entries.map((r) => (
                              <div
                                key={r.id}
                                className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50"
                              >
                                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/50 px-1.5 py-0.5 rounded">
                                  #{r.rank}
                                </span>
                                <span className="text-xs text-slate-800 dark:text-slate-200 truncate flex-1">
                                  {r.title}
                                </span>
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 flex-shrink-0">
                                  {r.author || ''}
                                </span>
                                {r.views !== null && (
                                  <span className="text-[10px] text-slate-400 flex-shrink-0">
                                    {formatViews(r.views)}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </>
          ) : (
            <p className="text-sm text-slate-400 text-center py-8">
              이전 수집일 데이터가 없어 비교할 수 없습니다
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** 강화된 Surge 테이블 (정렬 모드 반영) */
function EnhancedSurgeTable({
  items,
  title,
  sortMode,
  limit = 30,
}: {
  items: SurgeItem[];
  title: string;
  sortMode: SurgeSort;
  limit?: number;
}) {
  const display = items.slice(0, limit);

  if (display.length === 0) {
    return (
      <div className="text-center text-sm text-slate-400 py-4">
        {title} 데이터가 없습니다
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              <th className="text-left py-1.5 px-2 text-slate-500">#</th>
              <th className="text-left py-1.5 px-2 text-slate-500">작품</th>
              <th className="text-left py-1.5 px-2 text-slate-500">플랫폼</th>
              <th className="text-right py-1.5 px-2 text-slate-500">
                상승폭{sortMode === 'absolute' && <span className="ml-0.5 text-blue-400">*</span>}
              </th>
              <th className="text-right py-1.5 px-2 text-slate-500">
                상승률{sortMode === 'percent' && <span className="ml-0.5 text-blue-400">*</span>}
              </th>
            </tr>
          </thead>
          <tbody>
            {display.map((item, i) => (
              <tr
                key={`${item.novel_id}-${i}`}
                className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <td className="py-1.5 px-2 text-slate-400">{i + 1}</td>
                <td className="py-1.5 px-2 font-medium text-slate-800 dark:text-slate-200 max-w-[160px] truncate">
                  {item.title}
                </td>
                <td className="py-1.5 px-2">
                  <PlatformBadge platform={item.platform} />
                </td>
                <td
                  className={`py-1.5 px-2 text-right font-medium ${
                    sortMode === 'absolute'
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  +{formatViews(item.surge)}
                </td>
                <td
                  className={`py-1.5 px-2 text-right ${
                    sortMode === 'percent'
                      ? 'text-blue-600 dark:text-blue-400 font-medium'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {item.surge_rate}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
