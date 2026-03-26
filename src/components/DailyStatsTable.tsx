/**
 * DailyStatsTable — 읽기 전용 일일 통계 페이지네이션 테이블
 * 데스크톱 앱 DailyStatsInput "최근 입력 내역" 재현
 */
import { useState, useMemo } from 'react';
import type { DailyStatistics } from '../db/types';
import { formatViews, formatDelta, formatDateShort, formatPercent } from '../utils/format';
import { normalizePlatform } from '../utils/platform';

const ROWS_PER_PAGE = 20;

/* ── 타입 ── */

interface Props {
  stats: DailyStatistics[];
  platform: string;
  novelId: number;
}

interface DetailData {
  avg_read_through_rate?: number;
  is_paid?: boolean;
  max_episode_subs?: number;
  [key: string]: unknown;
}

interface StatsRow {
  date: string;
  views: number;
  delta: number;
  deltaRate: number;
  promotionActive: boolean;
  promotionNote: string;
  promotionTags: string[];
  readThroughRate: number | null;       // 문피아 연독률
  isPaid: boolean;                      // 문피아 유료 여부
  maxEpisodeSubs: number | null;        // 문피아 유료첫날 max 구독수
  conversionRate: number | null;        // 전환률
  conversionMetric: string | null;      // 전환지표 텍스트
}

/* ── 유틸 ── */

function safeParseJson(str: string | null | undefined): DetailData {
  if (!str) return {};
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}

function parseTags(str: string | null | undefined): string[] {
  if (!str) return [];
  try {
    const arr = JSON.parse(str);
    return Array.isArray(arr) ? arr.filter(Boolean) : [];
  } catch {
    return [];
  }
}

/** 네이버/카카오 조회수를 만 단위로 표시 */
function formatViewsMaan(v: number): string {
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억`;
  return `${(v / 10_000).toFixed(1)}만`;
}

/** 문피아 전환률/전환지표 계산 (date DESC 정렬된 rows 기준) */
function computeConversion(rows: StatsRow[]): void {
  // rows는 날짜 내림차순. 전환률은 "유료 둘째날"행에 표시.
  // 유료 둘째날 = rows[i] where rows[i].isPaid && rows[i+1].isPaid && !rows[i+2].isPaid
  // (i+1 = 유료 첫날, i+2 = 무료 마지막날; rows가 DESC이므로 i+1이 더 이른 날짜)
  for (let i = 0; i < rows.length - 2; i++) {
    const cur = rows[i];       // 유료 둘째날 후보
    const prev = rows[i + 1];  // 유료 첫날 후보
    const pprev = rows[i + 2]; // 무료 마지막날 후보

    if (cur.isPaid && prev.isPaid && !pprev.isPaid) {
      // 전환지표: 유료 첫날 max episode 구독수
      if (prev.maxEpisodeSubs != null && prev.maxEpisodeSubs > 0) {
        cur.conversionMetric = `${prev.maxEpisodeSubs.toLocaleString()}전환`;
      }
      // 전환률: (유료첫날 max구독수) / (무료마지막전날 조회수증가분 x 연독률/100) x 100
      const freeDelta = pprev.delta;
      const readThrough = pprev.readThroughRate ?? prev.readThroughRate;
      if (
        prev.maxEpisodeSubs != null &&
        prev.maxEpisodeSubs > 0 &&
        freeDelta > 0 &&
        readThrough != null &&
        readThrough > 0
      ) {
        cur.conversionRate =
          (prev.maxEpisodeSubs / (freeDelta * (readThrough / 100))) * 100;
      }
    }
  }
}

/* ── 행 빌드 ── */

function buildRows(stats: DailyStatistics[], isMunpia: boolean): StatsRow[] {
  // stats는 date ASC → 역순(DESC)으로 변환
  const rows: StatsRow[] = [];
  for (let i = stats.length - 1; i >= 0; i--) {
    const cur = stats[i];
    const prev = i > 0 ? stats[i - 1] : null;
    const delta = prev ? cur.views - prev.views : 0;
    const deltaRate = prev && prev.views > 0 ? (delta / prev.views) * 100 : 0;

    const detail = safeParseJson(cur.detail_data);
    const tags = parseTags(cur.promotion_tags);

    rows.push({
      date: cur.date,
      views: cur.views,
      delta,
      deltaRate,
      promotionActive: cur.promotion_active === 1,
      promotionNote: cur.promotion_note || '',
      promotionTags: tags,
      readThroughRate: isMunpia && detail.avg_read_through_rate != null
        ? Number(detail.avg_read_through_rate)
        : null,
      isPaid: !!detail.is_paid,
      maxEpisodeSubs: detail.max_episode_subs != null ? Number(detail.max_episode_subs) : null,
      conversionRate: null,
      conversionMetric: null,
    });
  }

  if (isMunpia) {
    computeConversion(rows);
  }

  return rows;
}

/* ── 태그 뱃지 색상 ── */

const TAG_COLORS: Record<string, string> = {
  '무료': 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  '할인': 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  '이벤트': 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  '출간': 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  'default': 'bg-amber-100 text-amber-700 dark:bg-amber-800/40 dark:text-amber-300',
};

function getTagColor(tag: string): string {
  for (const [key, cls] of Object.entries(TAG_COLORS)) {
    if (key !== 'default' && tag.includes(key)) return cls;
  }
  return TAG_COLORS['default'];
}

/* ── 메인 컴포넌트 ── */

export default function DailyStatsTable({ stats, platform }: Props) {
  const [page, setPage] = useState(0);

  const normalized = normalizePlatform(platform);
  const isMunpia = normalized === '문피아';
  const isManUnit = normalized === '네이버' || normalized === '카카오';

  const rows = useMemo(() => buildRows(stats, isMunpia), [stats, isMunpia]);
  const totalPages = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
  const pageRows = rows.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE);

  const viewsFormatter = isManUnit ? formatViewsMaan : formatViews;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
      {/* 헤더 + 페이지네이션 */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-200 dark:border-slate-700">
        <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
          최근 입력 내역 ({rows.length}건)
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
            >
              ◀ 이전
            </button>
            <span className="text-slate-500 dark:text-slate-400 min-w-[4rem] text-center">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
            >
              다음 ▶
            </button>
          </div>
        )}
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-700">
              <th className="text-left px-3 py-2 font-medium whitespace-nowrap">날짜</th>
              <th className="text-right px-3 py-2 font-medium whitespace-nowrap">조회수</th>
              <th className="text-right px-3 py-2 font-medium whitespace-nowrap">일일 증가분</th>
              <th className="text-right px-3 py-2 font-medium whitespace-nowrap">증가율</th>
              {isMunpia && (
                <th className="text-right px-3 py-2 font-medium whitespace-nowrap">연독률</th>
              )}
              {isMunpia && (
                <th className="text-right px-3 py-2 font-medium whitespace-nowrap">전환률</th>
              )}
              {isMunpia && (
                <th className="text-right px-3 py-2 font-medium whitespace-nowrap">전환지표</th>
              )}
              <th className="text-center px-3 py-2 font-medium whitespace-nowrap">프로모션</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td
                  colSpan={isMunpia ? 8 : 5}
                  className="text-center py-8 text-slate-400 dark:text-slate-500"
                >
                  조회수 데이터가 없습니다
                </td>
              </tr>
            ) : (
              pageRows.map((row) => {
                const deltaColor =
                  row.delta > 0
                    ? 'text-green-600 dark:text-green-400'
                    : row.delta < 0
                      ? 'text-red-500 dark:text-red-400'
                      : 'text-slate-400 dark:text-slate-500';

                const rateColor =
                  row.deltaRate > 0
                    ? 'text-green-600 dark:text-green-400'
                    : row.deltaRate < 0
                      ? 'text-red-500 dark:text-red-400'
                      : 'text-slate-400 dark:text-slate-500';

                return (
                  <tr
                    key={row.date}
                    className={`border-b border-slate-50 dark:border-slate-700/50 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/30 ${
                      row.promotionActive
                        ? 'bg-amber-50/50 dark:bg-amber-900/10'
                        : ''
                    } ${
                      row.isPaid && isMunpia
                        ? 'bg-blue-50/30 dark:bg-blue-900/10'
                        : ''
                    }`}
                  >
                    {/* 날짜 */}
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {formatDateShort(row.date)}
                      {row.isPaid && isMunpia && (
                        <span className="ml-1 text-[9px] text-blue-500 dark:text-blue-400 font-medium">유료</span>
                      )}
                    </td>

                    {/* 조회수 */}
                    <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-200 font-medium whitespace-nowrap">
                      {viewsFormatter(row.views)}
                    </td>

                    {/* 일일 증가분 */}
                    <td className={`px-3 py-2 text-right font-medium whitespace-nowrap ${deltaColor}`}>
                      {row.delta !== 0 ? formatDelta(row.delta) : '-'}
                    </td>

                    {/* 증가율 */}
                    <td className={`px-3 py-2 text-right whitespace-nowrap ${rateColor}`}>
                      {row.deltaRate !== 0 ? formatPercent(row.deltaRate) : '-'}
                    </td>

                    {/* 문피아: 연독률 */}
                    {isMunpia && (
                      <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {row.readThroughRate != null
                          ? `${row.readThroughRate.toFixed(1)}%`
                          : '-'}
                      </td>
                    )}

                    {/* 문피아: 전환률 */}
                    {isMunpia && (
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {row.conversionRate != null ? (
                          <span className="text-purple-600 dark:text-purple-400 font-medium">
                            {row.conversionRate.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600">-</span>
                        )}
                      </td>
                    )}

                    {/* 문피아: 전환지표 */}
                    {isMunpia && (
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {row.conversionMetric ? (
                          <span className="text-indigo-600 dark:text-indigo-400 font-medium">
                            {row.conversionMetric}
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600">-</span>
                        )}
                      </td>
                    )}

                    {/* 프로모션 */}
                    <td className="px-3 py-2 text-center">
                      {row.promotionTags.length > 0 ? (
                        <div className="flex flex-wrap gap-0.5 justify-center">
                          {row.promotionTags.map((tag, idx) => (
                            <span
                              key={idx}
                              className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${getTagColor(tag)}`}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : row.promotionActive ? (
                        <span
                          className="inline-block px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-800/40 text-amber-700 dark:text-amber-300 text-[10px]"
                          title={row.promotionNote}
                        >
                          {row.promotionNote
                            ? row.promotionNote.length > 8
                              ? row.promotionNote.slice(0, 8) + '...'
                              : row.promotionNote
                            : 'ON'}
                        </span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">-</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 하단 페이지네이션 (데이터 많을 때) */}
      {totalPages > 1 && rows.length > ROWS_PER_PAGE && (
        <div className="flex items-center justify-center gap-2 px-3 py-2 border-t border-slate-200 dark:border-slate-700 text-xs">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          >
            ◀ 이전
          </button>
          <span className="text-slate-500 dark:text-slate-400">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          >
            다음 ▶
          </button>
        </div>
      )}
    </div>
  );
}
