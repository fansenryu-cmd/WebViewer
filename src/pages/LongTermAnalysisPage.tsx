/**
 * 롱텀 데이터 분석 페이지 — 모바일 웹 뷰어
 *
 * 6개 서브탭:
 * 1. 랭킹 체류 — 작품별 체류 일수, streak, 티어 분포
 * 2. 장르 생태계 — 월별 장르 비중, Rising/Declining
 * 3. 출판사 점유율 — HHI/CR 추이, 다작 작가
 * 4. 프로모션 효과 — Before/During/After 비교
 * 5. 계절성 — 요일/월/분기 패턴
 * 6. 키워드 트렌드 — 월별 키워드 빈도, Rising/Falling
 */
import { useState, useMemo } from 'react';
import { useDb } from '../hooks/useDb';
import {
  analyzeRankingTenure,
  analyzeGenreEcosystem,
  analyzePublisherMarket,
  analyzePromotionEffect,
  analyzeSeasonality,
  analyzeKeywordTrend,
} from '../services/longTermAnalysisService';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Cell, ComposedChart,
} from 'recharts';
import { PLATFORM_COLORS } from '../utils/platform';
import { formatViews } from '../utils/format';

/* ─── Types ─── */

type Tab = 'ranking' | 'genre' | 'publisher' | 'promotion' | 'season' | 'keyword';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'ranking', label: '랭킹 체류', icon: '🏆' },
  { key: 'genre', label: '장르', icon: '🌿' },
  { key: 'publisher', label: '출판사', icon: '🏢' },
  { key: 'promotion', label: '프로모션', icon: '📣' },
  { key: 'season', label: '계절성', icon: '🗓️' },
  { key: 'keyword', label: '키워드', icon: '🔤' },
];

const CHART_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#14b8a6'];

/* ─── Shared ─── */

function StatBox({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-2.5 text-center">
      <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">{label}</div>
      <div className="text-sm font-bold text-slate-800 dark:text-white">{value}</div>
      {sub && <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function ErrorBlock({ error }: { error: string }) {
  return (
    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50">
      <p className="text-amber-800 dark:text-amber-300 font-medium text-xs mb-1">데이터 부족</p>
      <p className="text-amber-700 dark:text-amber-400 text-xs whitespace-pre-line">{error}</p>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">{children}</h3>;
}

/* ─── Tab Content ─── */

function RankingTab({ data }: { data: any }) {
  if (!data) return null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <StatBox label="1~3일" value={data.tier_distribution?.['1_to_3_days'] ?? 0} sub="단기" />
        <StatBox label="8~14일" value={data.tier_distribution?.['8_to_14_days'] ?? 0} sub="중기" />
        <StatBox label="31일+" value={data.tier_distribution?.['31_plus_days'] ?? 0} sub="스테디" />
      </div>

      {data.platform_averages?.length > 0 && (
        <div>
          <SectionTitle>플랫폼별 평균 체류일수</SectionTitle>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.platform_averages} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${v}일`} />
              <YAxis type="category" dataKey="platform" width={80} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => `${v}일`} />
              <Bar dataKey="avg_days" name="평균">
                {data.platform_averages.map((e: any, i: number) => (
                  <Cell key={i} fill={PLATFORM_COLORS[e.platform] || CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {data.top_novels?.length > 0 && (
        <div>
          <SectionTitle>TOP 랭킹 체류 작품</SectionTitle>
          <div className="space-y-1.5">
            {data.top_novels.slice(0, 15).map((n: any, i: number) => (
              <div key={i} className="flex items-center justify-between bg-white dark:bg-slate-800 rounded-lg p-2 text-xs">
                <div className="flex-1 min-w-0">
                  <span className="text-slate-400 mr-1">{i + 1}.</span>
                  <span className="font-medium text-slate-900 dark:text-white truncate">{n.title}</span>
                </div>
                <div className="flex gap-2 text-[10px] flex-shrink-0 ml-2">
                  <span className="text-indigo-600 dark:text-indigo-400 font-bold">{n.total_days}일</span>
                  <span className="text-amber-600 dark:text-amber-400">🔥{n.max_streak}</span>
                  <span className="text-slate-500">{n.best_rank}위</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function GenreTab({ data }: { data: any }) {
  if (!data) return null;
  const genreColors: Record<string, string> = {};
  (data.genre_list || []).forEach((g: string, i: number) => {
    genreColors[g] = CHART_COLORS[i % CHART_COLORS.length];
  });

  return (
    <div className="space-y-4">
      {data.monthly_distribution?.length > 0 && (
        <div>
          <SectionTitle>월별 장르 비중 (%)</SectionTitle>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data.monthly_distribution}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 9 }} />
              <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => `${v}%`} />
              <Legend wrapperStyle={{ fontSize: 9 }} />
              {data.genre_list.slice(0, 6).map((g: string) => (
                <Area key={g} type="monotone" dataKey={g} stackId="1"
                  fill={genreColors[g]} stroke={genreColors[g]} fillOpacity={0.7} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3">
        {data.rising_genres?.length > 0 && (
          <div>
            <SectionTitle>📈 신흥 장르</SectionTitle>
            {data.rising_genres.map((g: any, i: number) => (
              <div key={i} className="flex justify-between bg-emerald-50 dark:bg-emerald-900/20 rounded p-2 text-xs mb-1">
                <span className="font-medium">{g.genre}</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">+{g.change_pct}%</span>
              </div>
            ))}
          </div>
        )}
        {data.declining_genres?.length > 0 && (
          <div>
            <SectionTitle>📉 쇠퇴 장르</SectionTitle>
            {data.declining_genres.map((g: any, i: number) => (
              <div key={i} className="flex justify-between bg-red-50 dark:bg-red-900/20 rounded p-2 text-xs mb-1">
                <span className="font-medium">{g.genre}</span>
                <span className="font-bold text-red-600 dark:text-red-400">{g.change_pct}%</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PublisherTab({ data }: { data: any }) {
  if (!data) return null;
  return (
    <div className="space-y-4">
      {data.hhi_trend?.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <StatBox label="HHI" value={data.hhi_trend[data.hhi_trend.length - 1]?.hhi ?? '-'} />
            <StatBox label="CR3" value={`${data.hhi_trend[data.hhi_trend.length - 1]?.cr3 ?? '-'}%`} />
            <StatBox label="CR5" value={`${data.hhi_trend[data.hhi_trend.length - 1]?.cr5 ?? '-'}%`} />
          </div>
          <div>
            <SectionTitle>시장 집중도 추이</SectionTitle>
            <ResponsiveContainer width="100%" height={250}>
              <ComposedChart data={data.hhi_trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 9 }} />
                <YAxis yAxisId="hhi" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="cr" orientation="right" tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar yAxisId="hhi" dataKey="hhi" name="HHI" fill="#6366f1" opacity={0.5} />
                <Line yAxisId="cr" type="monotone" dataKey="cr3" name="CR3" stroke="#ef4444" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {data.prolific_authors?.length > 0 && (
        <div>
          <SectionTitle>다작 작가 (2+작품 동시 랭킹)</SectionTitle>
          {data.prolific_authors.slice(0, 10).map((a: any, i: number) => (
            <div key={i} className="flex justify-between bg-white dark:bg-slate-800 rounded p-2 text-xs mb-1">
              <span className="font-medium truncate flex-1">{a.author}</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-bold ml-2">{a.unique_titles}작품</span>
              <span className="text-slate-500 ml-2">{a.multi_ranking_days}일</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PromotionTab({ data }: { data: any }) {
  if (!data) return null;
  if (data.overall_summary?.total_events === 0) {
    return <div className="text-center text-slate-500 dark:text-slate-400 py-6 text-xs">프로모션 데이터가 없습니다.</div>;
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <StatBox label="프로모션 이벤트" value={data.overall_summary?.total_events ?? 0} />
        <StatBox label="평균 lift" value={`${data.overall_summary?.avg_lift_pct ?? 0}%`} />
      </div>

      {data.tag_effectiveness?.length > 0 && (
        <div>
          <SectionTitle>태그별 효과</SectionTitle>
          {data.tag_effectiveness.map((t: any, i: number) => (
            <div key={i} className="flex justify-between bg-white dark:bg-slate-800 rounded p-2 text-xs mb-1">
              <span className="truncate flex-1">{t.tag}</span>
              <span className={`font-bold ml-2 ${t.avg_lift_pct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {t.avg_lift_pct >= 0 ? '+' : ''}{t.avg_lift_pct}%
              </span>
            </div>
          ))}
        </div>
      )}

      {data.promotion_events?.length > 0 && (
        <div>
          <SectionTitle>프로모션 이벤트 상세</SectionTitle>
          {data.promotion_events.slice(0, 10).map((e: any, i: number) => (
            <div key={i} className="bg-white dark:bg-slate-800 rounded p-2 text-xs mb-1.5">
              <div className="flex justify-between mb-1">
                <span className="font-medium truncate flex-1">{e.title}</span>
                <span className={`font-bold ml-2 ${e.lift_pct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {e.lift_pct >= 0 ? '+' : ''}{e.lift_pct}%
                </span>
              </div>
              <div className="text-[10px] text-slate-500">{e.start_date}~{e.end_date} ({e.duration_days}일)</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SeasonTab({ data }: { data: any }) {
  if (!data) return null;
  return (
    <div className="space-y-4">
      {data.day_of_week?.length > 0 && (
        <div>
          <SectionTitle>요일별 평균 랭킹 진입수</SectionTitle>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.day_of_week}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => `${v}건`} />
              <Bar dataKey="avg_entries" name="평균">
                {data.day_of_week.map((_: any, i: number) => (
                  <Cell key={i} fill={[5, 6].includes(i) ? '#f59e0b' : '#6366f1'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {data.monthly_volume?.length > 0 && (
        <div>
          <SectionTitle>월별 시장 총 조회수</SectionTitle>
          <ResponsiveContainer width="100%" height={250}>
            <ComposedChart data={data.monthly_volume}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 9 }} />
              <YAxis yAxisId="views" tickFormatter={formatViews} tick={{ fontSize: 10 }} />
              <YAxis yAxisId="growth" orientation="right" tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Area yAxisId="views" type="monotone" dataKey="total_views" name="조회수" fill="#6366f1" fillOpacity={0.3} stroke="#6366f1" />
              <Line yAxisId="growth" type="monotone" dataKey="growth_pct" name="성장률(%)" stroke="#ef4444" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {data.quarterly_growth?.length > 0 && (
        <div>
          <SectionTitle>분기별 성장률</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            {data.quarterly_growth.map((q: any, i: number) => (
              <StatBox key={i} label={q.quarter}
                value={`${q.growth_pct >= 0 ? '+' : ''}${q.growth_pct}%`}
                sub={`${formatViews(q.total_views)}`} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KeywordTab({ data }: { data: any }) {
  if (!data) return null;
  return (
    <div className="space-y-4">
      {data.keyword_monthly_trend?.length > 0 && data.top_keywords?.length > 0 && (
        <div>
          <SectionTitle>TOP 10 키워드 월별 빈도</SectionTitle>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data.keyword_monthly_trend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 9 }} />
              {data.top_keywords.slice(0, 8).map((kw: string, i: number) => (
                <Line key={kw} type="monotone" dataKey={kw}
                  stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={1.5} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3">
        {data.rising?.length > 0 && (
          <div>
            <SectionTitle>🔥 급상승 키워드</SectionTitle>
            {data.rising.slice(0, 8).map((k: any, i: number) => (
              <div key={i} className="flex justify-between bg-emerald-50 dark:bg-emerald-900/20 rounded p-2 text-xs mb-1">
                <span className="font-medium">{k.keyword}</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">+{k.change_pct}% ({k.total_count}회)</span>
              </div>
            ))}
          </div>
        )}
        {data.falling?.length > 0 && (
          <div>
            <SectionTitle>📉 하락 키워드</SectionTitle>
            {data.falling.slice(0, 8).map((k: any, i: number) => (
              <div key={i} className="flex justify-between bg-red-50 dark:bg-red-900/20 rounded p-2 text-xs mb-1">
                <span className="font-medium">{k.keyword}</span>
                <span className="font-bold text-red-600 dark:text-red-400">{k.change_pct}%</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {data.rank_correlation?.length > 0 && (
        <div>
          <SectionTitle>키워드-순위 상관 (평균 순위 낮을수록 상위)</SectionTitle>
          {data.rank_correlation.slice(0, 10).map((k: any, i: number) => (
            <div key={i} className="flex justify-between bg-white dark:bg-slate-800 rounded p-2 text-xs mb-1">
              <span className="font-medium">{k.keyword}</span>
              <div className="flex gap-2">
                <span className="text-indigo-600 dark:text-indigo-400 font-bold">{k.avg_rank}위</span>
                <span className="text-slate-500">{k.appearances}회</span>
                <span className="text-amber-600 dark:text-amber-400">TOP10 {k.top10_pct}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   메인 컴포넌트
   ═══════════════════════════════════════════ */

export default function LongTermAnalysisPage() {
  const { db } = useDb();
  const [tab, setTab] = useState<Tab>('ranking');

  const rankingData = useMemo(() => db ? analyzeRankingTenure(db, 6) : null, [db]);
  const genreData = useMemo(() => db && tab === 'genre' ? analyzeGenreEcosystem(db, 12) : null, [db, tab]);
  const publisherData = useMemo(() => db && tab === 'publisher' ? analyzePublisherMarket(db, 12) : null, [db, tab]);
  const promotionData = useMemo(() => db && tab === 'promotion' ? analyzePromotionEffect(db, 12) : null, [db, tab]);
  const seasonData = useMemo(() => db && tab === 'season' ? analyzeSeasonality(db, 12) : null, [db, tab]);
  const keywordData = useMemo(() => db && tab === 'keyword' ? analyzeKeywordTrend(db, 12, 20) : null, [db, tab]);

  const currentResult = tab === 'ranking' ? rankingData
    : tab === 'genre' ? genreData
    : tab === 'publisher' ? publisherData
    : tab === 'promotion' ? promotionData
    : tab === 'season' ? seasonData
    : keywordData;

  return (
    <div className="px-4 py-4">
      <h1 className="text-lg font-bold text-slate-800 dark:text-white mb-3">📈 롱텀 데이터 분석</h1>

      {/* 탭 */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700 pb-2 overflow-x-auto mb-4">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors ${
              tab === t.key
                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* 내용 */}
      {currentResult?.error && <ErrorBlock error={currentResult.error} />}
      {!currentResult?.error && currentResult?.data && (
        <>
          {tab === 'ranking' && <RankingTab data={currentResult.data} />}
          {tab === 'genre' && <GenreTab data={currentResult.data} />}
          {tab === 'publisher' && <PublisherTab data={currentResult.data} />}
          {tab === 'promotion' && <PromotionTab data={currentResult.data} />}
          {tab === 'season' && <SeasonTab data={currentResult.data} />}
          {tab === 'keyword' && <KeywordTab data={currentResult.data} />}
        </>
      )}
      {!currentResult && (
        <div className="text-center text-slate-400 py-8 text-sm">DB를 로드한 후 분석할 수 있습니다.</div>
      )}
    </div>
  );
}
