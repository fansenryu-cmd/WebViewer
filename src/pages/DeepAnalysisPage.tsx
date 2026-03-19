/**
 * 심층 분석 페이지 (Deep Analysis) — 모바일 웹 뷰어
 *
 * 5개 서브탭:
 * 1. 시계열·예측 — 이동평균 분해 + MA 예측
 * 2. 생존·시장 — Kaplan-Meier 생존 곡선 + HHI/Gini 시장 집중도
 * 3. 패널·성장 — 데스크톱 전용 안내
 * 4. 텍스트·네트워크 — TF-IDF 키워드 + 공출현 네트워크
 * 5. 교차·전환 — 장르×플랫폼 히트맵 + 전환 퍼널
 */
import { useState, useMemo } from 'react';
import { useDb } from '../hooks/useDb';
import { getAllNovels } from '../db/queries';
import {
  analyzeDecomposition,
  analyzeForecast,
  analyzeSurvival,
  analyzeConcentration,
  analyzeTfidf,
  analyzeCrossPlatform,
  analyzeConversionFunnel,
} from '../services/deepAnalysisService';
import {
  analyzeRankingTenure,
  analyzeGenreEcosystem,
  analyzePublisherMarket,
  analyzePromotionEffect,
  analyzeSeasonality,
  analyzeKeywordTrend,
} from '../services/longTermAnalysisService';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts';
import { PLATFORM_COLORS, normalizePlatform } from '../utils/platform';
import { formatViews } from '../utils/format';

/* ─── Types ─── */

type Tab = 'timeseries' | 'ranking-survival' | 'market-publisher' | 'panel-growth' | 'text-keyword' | 'genre-cross' | 'conversion-promo';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'timeseries', label: '시계열', icon: '📈' },
  { key: 'ranking-survival', label: '랭킹', icon: '🏆' },
  { key: 'market-publisher', label: '시장', icon: '📊' },
  { key: 'panel-growth', label: '패널', icon: '📉' },
  { key: 'text-keyword', label: '텍스트', icon: '📝' },
  { key: 'genre-cross', label: '장르', icon: '🌿' },
  { key: 'conversion-promo', label: '전환', icon: '💰' },
];

const CHART_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

/* ─── Shared sub-components ─── */

function StatBox({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 text-center">
      <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">{label}</div>
      <div className="text-sm font-bold text-slate-800 dark:text-white">{value}</div>
      {sub && <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function ErrorBlock({ error }: { error: string }) {
  return (
    <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50">
      <p className="text-amber-800 dark:text-amber-300 font-medium text-xs mb-1">데이터 부족</p>
      <p className="text-amber-700 dark:text-amber-400 text-xs whitespace-pre-line">{error}</p>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">{children}</h3>;
}

function LongTermDivider({ label }: { label: string }) {
  return (
    <div className="border-t-2 border-dashed border-indigo-200 dark:border-indigo-800 my-4 pt-2">
      <p className="text-[10px] text-indigo-500 dark:text-indigo-400 font-medium">📊 롱텀 · {label}</p>
    </div>
  );
}

const tooltipStyle = {
  contentStyle: {
    background: 'rgba(30,41,59,0.95)',
    border: 'none',
    borderRadius: '8px',
    fontSize: '11px',
    color: '#e2e8f0',
  },
};

/* ═══════════════════════════════════════════
   Main Page Component
   ═══════════════════════════════════════════ */

export default function DeepAnalysisPage() {
  const { db } = useDb();
  const [subTab, setSubTab] = useState<Tab>('timeseries');

  if (!db) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 dark:text-slate-500">
        DB를 먼저 로드해주세요
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">
        🔬 심층 분석
      </h1>

      {/* Tab bar */}
      <div className="flex gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 overflow-x-auto">
        {TABS.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={`flex-1 min-w-0 py-1.5 px-1 rounded-md transition-colors text-center whitespace-nowrap ${
              subTab === key
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 font-semibold shadow-sm'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <span className="text-xs">{icon}</span>
            <span className="text-[10px] block leading-tight">{label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {subTab === 'timeseries' && (
        <>
          <TimeSeriesSection db={db} />
          <LongTermDivider label="계절성/주기성" />
          <SeasonalitySection db={db} />
        </>
      )}
      {subTab === 'ranking-survival' && (
        <>
          <SurvivalMarketSection db={db} mode="survival" />
          <LongTermDivider label="랭킹 체류 분석" />
          <RankingTenureSection db={db} />
        </>
      )}
      {subTab === 'market-publisher' && (
        <>
          <SurvivalMarketSection db={db} mode="market" />
          <LongTermDivider label="출판사/작가 시장 점유율" />
          <PublisherMarketSection db={db} />
        </>
      )}
      {subTab === 'panel-growth' && <PanelGrowthSection />}
      {subTab === 'text-keyword' && (
        <>
          <TextNetworkSection db={db} />
          <LongTermDivider label="키워드 트렌드 진화" />
          <KeywordTrendSection db={db} />
        </>
      )}
      {subTab === 'genre-cross' && (
        <>
          <CrossConversionSection db={db} mode="cross" />
          <LongTermDivider label="장르 생태계 변화" />
          <GenreEcosystemSection db={db} />
        </>
      )}
      {subTab === 'conversion-promo' && (
        <>
          <CrossConversionSection db={db} mode="funnel" />
          <LongTermDivider label="프로모션 효과 계량화" />
          <PromotionEffectSection db={db} />
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   1. 시계열·예측 (TimeSeriesSection)
   ═══════════════════════════════════════════ */

function TimeSeriesSection({ db }: { db: import('sql.js').Database }) {
  const novels = useMemo(() => getAllNovels(db), [db]);
  const [selectedNovelId, setSelectedNovelId] = useState<number | 0>(0);
  const [platform, setPlatform] = useState('');
  const [days, setDays] = useState(90);

  const decomp = useMemo(() => {
    return analyzeDecomposition(
      db,
      platform || undefined,
      selectedNovelId || undefined,
      days,
    );
  }, [db, platform, selectedNovelId, days]);

  const forecast = useMemo(() => {
    return analyzeForecast(
      db,
      platform || undefined,
      selectedNovelId || undefined,
      30,
    );
  }, [db, platform, selectedNovelId]);

  // Build platform options from novels
  const platforms = useMemo(() => {
    const set = new Set<string>();
    for (const n of novels) {
      if (n.platform) set.add(normalizePlatform(n.platform));
    }
    return [...set].sort();
  }, [novels]);

  return (
    <div className="space-y-4">
      {/* Selectors */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700 space-y-2">
        <div className="flex flex-wrap gap-2">
          <select
            value={selectedNovelId}
            onChange={(e) => setSelectedNovelId(Number(e.target.value))}
            className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-xs text-slate-800 dark:text-slate-200"
          >
            <option value={0}>전체 (플랫폼 합산)</option>
            {novels.map((n) => (
              <option key={n.id} value={n.id}>
                {n.title} [{normalizePlatform(n.platform)}]
              </option>
            ))}
          </select>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-xs text-slate-800 dark:text-slate-200"
          >
            <option value="">전체</option>
            {platforms.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-1">
          {[30, 60, 90, 180].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`flex-1 py-1 rounded-md text-xs transition-colors ${
                days === d
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              {d}일
            </button>
          ))}
        </div>
      </div>

      {/* Decomposition */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
        <SectionTitle>시계열 분해 (이동평균)</SectionTitle>
        {decomp.error ? (
          <ErrorBlock error={decomp.error} />
        ) : decomp.data ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <StatBox label="데이터" value={`${decomp.data.data_points}일`} />
              <StatBox label="주기" value={`${decomp.data.period}일`} />
              <StatBox label="모델" value="Additive" />
            </div>

            {/* Original + Trend overlay */}
            <p className="text-[10px] text-slate-500 dark:text-slate-400">원본 + 트렌드</p>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart
                data={decomp.data.original.map((o, i) => ({
                  date: o.date.slice(5),
                  original: o.value,
                  trend: decomp.data!.trend[i]?.value ?? null,
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9 }} width={40} />
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="original" name="원본" stroke="#6366f1" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="trend" name="트렌드" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>

            {/* Seasonal */}
            <p className="text-[10px] text-slate-500 dark:text-slate-400">계절성 (요일 패턴)</p>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart
                data={decomp.data.seasonal.map((s) => ({
                  date: s.date.slice(5),
                  value: s.value,
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9 }} width={40} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="value" name="계절성" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>

            {/* Residual */}
            <p className="text-[10px] text-slate-500 dark:text-slate-400">잔차 (노이즈)</p>
            <ResponsiveContainer width="100%" height={120}>
              <LineChart
                data={decomp.data.residual.map((r) => ({
                  date: r.date.slice(5),
                  value: r.value,
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9 }} width={40} />
                <Tooltip {...tooltipStyle} />
                <Line type="monotone" dataKey="value" name="잔차" stroke="#94a3b8" strokeWidth={1} dot={{ r: 1.5, fill: '#94a3b8' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-center text-slate-400 dark:text-slate-500 py-8 text-xs">분석할 데이터가 없습니다</p>
        )}
      </div>

      {/* Forecast */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
        <SectionTitle>조회수 예측 (MA)</SectionTitle>
        {forecast.error ? (
          <ErrorBlock error={forecast.error} />
        ) : forecast.data ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <StatBox label="모델" value="MA-7" />
              <StatBox label="AIC" value={forecast.data.aic ?? '-'} />
              <StatBox label="예측" value={`${forecast.data.forecast_days}일`} />
            </div>
            {forecast.data.notice && (
              <p className="text-[10px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/50 rounded-lg p-2">
                {forecast.data.notice}
              </p>
            )}
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart
                data={[
                  ...forecast.data.history.map((h) => ({
                    date: h.date.slice(5),
                    value: h.value,
                    ci_lower: null as number | null,
                    ci_upper: null as number | null,
                  })),
                  ...forecast.data.forecast.map((f) => ({
                    date: f.date.slice(5),
                    value: f.predicted,
                    ci_lower: f.ci_lower,
                    ci_upper: f.ci_upper,
                  })),
                ]}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9 }} width={40} />
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Area
                  type="monotone"
                  dataKey="ci_upper"
                  name="CI 상한"
                  stroke="none"
                  fill="#8b5cf6"
                  fillOpacity={0.15}
                />
                <Area
                  type="monotone"
                  dataKey="ci_lower"
                  name="CI 하한"
                  stroke="none"
                  fill="transparent"
                  fillOpacity={0}
                />
                <Line type="monotone" dataKey="value" name="실제/예측" stroke="#6366f1" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-center text-slate-400 dark:text-slate-500 py-8 text-xs">예측 데이터가 없습니다</p>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   2. 생존·시장 (SurvivalMarketSection)
   ═══════════════════════════════════════════ */

function SurvivalMarketSection({ db, mode }: { db: import('sql.js').Database; mode?: 'survival' | 'market' }) {
  const [survivalGroup, setSurvivalGroup] = useState<'platform' | 'genre'>('platform');
  const [marketDim, setMarketDim] = useState<'publisher' | 'genre' | 'platform'>('publisher');

  const survival = useMemo(
    () => analyzeSurvival(db, survivalGroup),
    [db, survivalGroup],
  );

  const market = useMemo(
    () => analyzeConcentration(db, marketDim),
    [db, marketDim],
  );

  return (
    <div className="space-y-4">
      {/* Survival */}
      {(!mode || mode === 'survival') && <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
        <SectionTitle>랭킹 생존 분석 (Kaplan-Meier)</SectionTitle>
        <div className="flex gap-2 mb-3">
          {(['platform', 'genre'] as const).map((g) => (
            <button
              key={g}
              onClick={() => setSurvivalGroup(g)}
              className={`flex-1 py-1 rounded-md text-xs transition-colors ${
                survivalGroup === g
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              {g === 'platform' ? '플랫폼별' : '장르별'}
            </button>
          ))}
        </div>

        {survival.error ? (
          <ErrorBlock error={survival.error} />
        ) : survival.data ? (
          <div className="space-y-3">
            {/* Median survival stats */}
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(survival.data.median_survival).slice(0, 6).map(([k, v]) => (
                <StatBox key={k} label={k} value={v !== null ? `${v}일` : '> 생존'} sub="중위 생존일" />
              ))}
            </div>

            {/* Survival curves */}
            <ResponsiveContainer width="100%" height={260}>
              <LineChart>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.3} />
                <XAxis
                  dataKey="x"
                  type="number"
                  tick={{ fontSize: 9 }}
                  label={{ value: '경과일', position: 'insideBottomRight', offset: -5, style: { fontSize: 9, fill: '#94a3b8' } }}
                />
                <YAxis
                  domain={[0, 1]}
                  tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                  tick={{ fontSize: 9 }}
                  width={36}
                />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(v: number) => `${(v * 100).toFixed(1)}%`}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <ReferenceLine y={0.5} stroke="#ef4444" strokeDasharray="5 5" />
                {survival.data.curves.map((curve, i) => {
                  const lineData = curve.timeline.map((t, j) => ({
                    x: t,
                    y: curve.survival_prob[j] ?? 0,
                  }));
                  const color =
                    PLATFORM_COLORS[normalizePlatform(curve.group)] ||
                    CHART_COLORS[i % CHART_COLORS.length];
                  return (
                    <Line
                      key={curve.group}
                      data={lineData}
                      type="stepAfter"
                      dataKey="y"
                      name={`${curve.group} (n=${curve.n})`}
                      stroke={color}
                      strokeWidth={2}
                      dot={false}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-center text-slate-400 dark:text-slate-500 py-8 text-xs">생존 분석 데이터가 없습니다</p>
        )}
      </div>}

      {/* Market Concentration */}
      {(!mode || mode === 'market') && <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
        <SectionTitle>시장 집중도 (HHI / Gini)</SectionTitle>
        <div className="flex gap-1 mb-3">
          {([
            { key: 'publisher' as const, label: '출판사' },
            { key: 'genre' as const, label: '장르' },
            { key: 'platform' as const, label: '플랫폼' },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setMarketDim(key)}
              className={`flex-1 py-1 rounded-md text-xs transition-colors ${
                marketDim === key
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {market.error ? (
          <ErrorBlock error={market.error} />
        ) : market.data ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <StatBox label="HHI" value={market.data.hhi} sub={market.data.hhi_interpretation} />
              <StatBox label="Gini" value={market.data.gini} />
              <StatBox label="CR3" value={`${(market.data.cr3 * 100).toFixed(1)}%`} />
              <StatBox label="CR5" value={`${(market.data.cr5 * 100).toFixed(1)}%`} />
            </div>

            {/* Shares bar chart */}
            {market.data.shares.length > 0 && (
              <>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">점유율 상위 15</p>
                <ResponsiveContainer width="100%" height={Math.min(market.data.shares.slice(0, 15).length * 24, 360)}>
                  <BarChart data={market.data.shares.slice(0, 15)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.3} />
                    <XAxis
                      type="number"
                      tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                      tick={{ fontSize: 9 }}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={80}
                      tick={{ fontSize: 9 }}
                    />
                    <Tooltip
                      {...tooltipStyle}
                      formatter={(v: number) => `${(v * 100).toFixed(1)}%`}
                    />
                    <Bar dataKey="share" name="점유율">
                      {market.data.shares.slice(0, 15).map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </>
            )}

            {/* Lorenz curve */}
            {market.data.lorenz_curve.length > 1 && (
              <>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">로렌츠 곡선 (완전 균등 = 대각선)</p>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={market.data.lorenz_curve}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.3} />
                    <XAxis
                      dataKey="cumulative_population"
                      tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                      tick={{ fontSize: 9 }}
                    />
                    <YAxis
                      tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                      tick={{ fontSize: 9 }}
                      width={36}
                    />
                    <Tooltip
                      {...tooltipStyle}
                      formatter={(v: number) => `${(v * 100).toFixed(1)}%`}
                    />
                    <Area
                      type="monotone"
                      dataKey="cumulative_share"
                      name="로렌츠"
                      stroke="#6366f1"
                      fill="#6366f1"
                      fillOpacity={0.2}
                    />
                    <Line
                      type="linear"
                      dataKey="cumulative_population"
                      name="균등선"
                      stroke="#ef4444"
                      strokeDasharray="5 5"
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </>
            )}
          </div>
        ) : (
          <p className="text-center text-slate-400 dark:text-slate-500 py-8 text-xs">시장 집중도 데이터가 없습니다</p>
        )}
      </div>}
    </div>
  );
}

/* ═══════════════════════════════════════════
   3. 패널·성장 (PanelGrowthSection) — Desktop Only
   ═══════════════════════════════════════════ */

function PanelGrowthSection() {
  return (
    <div className="space-y-4">
      {/* Panel Regression */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
        <SectionTitle>패널 데이터 회귀분석</SectionTitle>
        <div className="bg-slate-100 dark:bg-slate-700/50 rounded-xl p-6 text-center">
          <p className="text-2xl mb-2">🖥️</p>
          <p className="font-semibold text-slate-700 dark:text-slate-200 text-sm">데스크톱 앱 전용 분석</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            이 분석은 Python 통계 라이브러리(statsmodels, scipy)가 필요합니다.
          </p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
            NovelForge Pro 데스크톱 앱에서 확인해주세요.
          </p>
        </div>
      </div>

      {/* Growth Curve */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
        <SectionTitle>성장 곡선 다층 모형</SectionTitle>
        <div className="bg-slate-100 dark:bg-slate-700/50 rounded-xl p-6 text-center">
          <p className="text-2xl mb-2">🖥️</p>
          <p className="font-semibold text-slate-700 dark:text-slate-200 text-sm">데스크톱 앱 전용 분석</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            이 분석은 Python 통계 라이브러리(statsmodels, scipy)가 필요합니다.
          </p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
            NovelForge Pro 데스크톱 앱에서 확인해주세요.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   4. 텍스트·네트워크 (TextNetworkSection)
   ═══════════════════════════════════════════ */

function TextNetworkSection({ db }: { db: import('sql.js').Database }) {
  const result = useMemo(() => analyzeTfidf(db, 30), [db]);

  return (
    <div className="space-y-4">
      {result.error ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
          <ErrorBlock error={result.error} />
        </div>
      ) : result.data ? (
        <>
          {/* TF-IDF by platform */}
          <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
            <SectionTitle>TF-IDF 키워드 (플랫폼별)</SectionTitle>
            <div className="space-y-4">
              {result.data.tfidf_by_platform.map((platData) => {
                const color = PLATFORM_COLORS[normalizePlatform(platData.platform)] || '#6b7280';
                const chartData = platData.keywords.slice(0, 15).map((k) => ({
                  word: k.word,
                  score: k.score,
                  doc_freq: k.doc_freq,
                }));
                if (chartData.length === 0) return null;
                return (
                  <div key={platData.platform}>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                        {platData.platform}
                      </span>
                      <span className="text-[10px] text-slate-400">({platData.doc_count}개 제목)</span>
                    </div>
                    <ResponsiveContainer width="100%" height={Math.min(chartData.length * 22, 330)}>
                      <BarChart data={chartData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.3} />
                        <XAxis type="number" tick={{ fontSize: 9 }} />
                        <YAxis
                          type="category"
                          dataKey="word"
                          width={60}
                          tick={{ fontSize: 9 }}
                        />
                        <Tooltip
                          {...tooltipStyle}
                          formatter={(v: number, name: string) =>
                            name === 'score'
                              ? [`TF-IDF: ${v.toFixed(4)}`, '점수']
                              : [v, name]
                          }
                        />
                        <Bar dataKey="score" name="TF-IDF" fill={color} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Keyword associations */}
          {result.data.associations.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
              <SectionTitle>키워드 연관 규칙</SectionTitle>
              <div className="flex flex-wrap gap-1.5">
                {result.data.associations.slice(0, 25).map((assoc, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                  >
                    <span className="font-medium">{assoc.keywords.join(' + ')}</span>
                    <span className="text-slate-400 dark:text-slate-500 font-mono text-[10px]">
                      {assoc.count}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Network nodes (centrality list) */}
          {result.data.network.nodes.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
              <SectionTitle>키워드 네트워크 (중심성)</SectionTitle>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-2">
                중심성이 높을수록 다른 키워드와 자주 공출현
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                      <th className="text-left py-1.5 px-1">#</th>
                      <th className="text-left py-1.5 px-1">키워드</th>
                      <th className="text-right py-1.5 px-1">빈도</th>
                      <th className="text-right py-1.5 px-1">중심성</th>
                      <th className="text-left py-1.5 px-1 min-w-[80px]">시각화</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.data.network.nodes.slice(0, 20).map((node, i) => (
                      <tr key={node.id} className="border-b border-slate-100 dark:border-slate-700/50">
                        <td className="py-1.5 px-1 text-slate-400">{i + 1}</td>
                        <td className="py-1.5 px-1 text-slate-800 dark:text-slate-200 font-medium">{node.label}</td>
                        <td className="py-1.5 px-1 text-right text-slate-600 dark:text-slate-300 font-mono">{node.frequency}</td>
                        <td className="py-1.5 px-1 text-right text-slate-600 dark:text-slate-300 font-mono">{node.centrality.toFixed(3)}</td>
                        <td className="py-1.5 px-1">
                          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-indigo-500"
                              style={{ width: `${node.centrality * 100}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Network edges (top co-occurrences) */}
          {result.data.network.edges.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
              <SectionTitle>공출현 키워드 쌍</SectionTitle>
              <div className="flex flex-wrap gap-1.5">
                {result.data.network.edges.slice(0, 20).map((edge, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
                  >
                    {edge.source} — {edge.target}
                    <span className="font-mono text-indigo-400 dark:text-indigo-500">{edge.weight}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
          <p className="text-center text-slate-400 dark:text-slate-500 py-8 text-xs">텍스트 분석 데이터가 없습니다</p>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   5. 교차·전환 (CrossConversionSection)
   ═══════════════════════════════════════════ */

function CrossConversionSection({ db, mode }: { db: import('sql.js').Database; mode?: 'cross' | 'funnel' }) {
  const cross = useMemo(() => analyzeCrossPlatform(db), [db]);
  const funnel = useMemo(() => analyzeConversionFunnel(db), [db]);

  return (
    <div className="space-y-4">
      {/* Genre x Platform Heatmap */}
      {(!mode || mode === 'cross') && (cross.error ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
          <ErrorBlock error={cross.error} />
        </div>
      ) : cross.data ? (
        <>
          {/* Heatmap as table */}
          {cross.data.genre_platform_heatmap.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
              <SectionTitle>장르 x 플랫폼 히트맵</SectionTitle>
              <HeatmapTable data={cross.data.genre_platform_heatmap} />
            </div>
          )}

          {/* Platform synergy */}
          {cross.data.platform_synergy.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
              <SectionTitle>플랫폼 시너지 (다중 플랫폼 작가)</SectionTitle>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <StatBox
                  label="단일 플랫폼"
                  value={cross.data.single_platform_authors}
                  sub="명"
                />
                <StatBox
                  label="다중 플랫폼"
                  value={cross.data.multi_platform_authors}
                  sub="명"
                />
              </div>
              <ResponsiveContainer width="100%" height={Math.min(cross.data.platform_synergy.length * 28, 300)}>
                <BarChart data={cross.data.platform_synergy.slice(0, 10)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.3} />
                  <XAxis type="number" tick={{ fontSize: 9 }} />
                  <YAxis
                    type="category"
                    dataKey="combo"
                    width={120}
                    tick={{ fontSize: 9 }}
                  />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="author_count" name="작가 수" fill="#8b5cf6">
                    {cross.data.platform_synergy.slice(0, 10).map((item, i) => {
                      // Use the first platform in the combo for color
                      const firstPlatform = item.combo.split(' + ')[0];
                      const color = PLATFORM_COLORS[normalizePlatform(firstPlatform)] || CHART_COLORS[i % CHART_COLORS.length];
                      return <Cell key={i} fill={color} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Platform distributions */}
          {cross.data.platform_distributions.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
              <SectionTitle>플랫폼별 장르 분포</SectionTitle>
              <div className="space-y-3">
                {cross.data.platform_distributions.map((pd) => {
                  const color = PLATFORM_COLORS[normalizePlatform(pd.platform)] || '#6b7280';
                  return (
                    <div key={pd.platform}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{pd.platform}</span>
                        <span className="text-[10px] text-slate-400">({pd.total}개)</span>
                      </div>
                      <div className="flex h-4 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-700">
                        {pd.distribution.slice(0, 8).map((g, gi) => (
                          <div
                            key={g.genre}
                            className="h-full"
                            style={{
                              width: `${g.ratio * 100}%`,
                              backgroundColor: CHART_COLORS[gi % CHART_COLORS.length],
                              minWidth: g.ratio > 0 ? '2px' : '0',
                            }}
                            title={`${g.genre}: ${g.count} (${(g.ratio * 100).toFixed(1)}%)`}
                          />
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {pd.distribution.slice(0, 6).map((g, gi) => (
                          <span key={g.genre} className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-0.5">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: CHART_COLORS[gi % CHART_COLORS.length] }} />
                            {g.genre}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : null)}

      {/* Conversion Funnel */}
      {(!mode || mode === 'funnel') && (funnel.error ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
          <SectionTitle>전환 퍼널</SectionTitle>
          <ErrorBlock error={funnel.error} />
        </div>
      ) : funnel.data ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
          <SectionTitle>
            전환 퍼널 ({funnel.data.platform})
          </SectionTitle>
          <div className="space-y-3">
            {/* Summary stats */}
            <div className="grid grid-cols-2 gap-2">
              <StatBox label="전체 작품" value={funnel.data.total_novels} />
              <StatBox label="전환 감지" value={funnel.data.converted_count} />
              <StatBox label="평균 연독률" value={funnel.data.avg_read_through > 0 ? `${funnel.data.avg_read_through}%` : '-'} />
              <StatBox label="평균 전환률" value={funnel.data.avg_conversion_rate > 0 ? `${funnel.data.avg_conversion_rate}%` : '-'} />
            </div>

            {/* Funnel stages */}
            {funnel.data.funnel_stages.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] text-slate-500 dark:text-slate-400">퍼널 단계</p>
                {funnel.data.funnel_stages.map((stage, i) => {
                  const maxCount = funnel.data!.funnel_stages[0]?.count || 1;
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-600 dark:text-slate-300 w-24 truncate" title={stage.stage}>
                        {stage.stage}
                      </span>
                      <div className="flex-1 h-4 bg-slate-100 dark:bg-slate-700 rounded overflow-hidden">
                        <div
                          className="h-full rounded"
                          style={{
                            width: `${(stage.count / maxCount) * 100}%`,
                            backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                          }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-slate-600 dark:text-slate-300 w-8 text-right">
                        {stage.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Conversion distribution */}
            {funnel.data.conversion_distribution.length > 0 && (
              <div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-1">전환률 분포 (백분위)</p>
                <div className="grid grid-cols-5 gap-1">
                  {funnel.data.conversion_distribution.map((d) => (
                    <StatBox
                      key={d.percentile}
                      label={`P${d.percentile}`}
                      value={`${d.value}%`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Readthrough correlation */}
            {funnel.data.readthrough_correlation.n >= 5 && (
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-1">연독률 x 전환률 상관관계</p>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-bold text-slate-800 dark:text-white">
                    r = {funnel.data.readthrough_correlation.r}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    ({funnel.data.readthrough_correlation.interpretation || '-'}, n={funnel.data.readthrough_correlation.n})
                  </span>
                </div>
              </div>
            )}

            {/* Top performers */}
            {funnel.data.top_performers.length > 0 && (
              <div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-1">전환 상위 작품</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                        <th className="text-left py-1 px-1">작품</th>
                        <th className="text-right py-1 px-1">전환률</th>
                        <th className="text-right py-1 px-1">전환수</th>
                        <th className="text-right py-1 px-1">연독률</th>
                      </tr>
                    </thead>
                    <tbody>
                      {funnel.data.top_performers.slice(0, 8).map((p) => (
                        <tr key={p.novel_id} className="border-b border-slate-100 dark:border-slate-700/50">
                          <td className="py-1 px-1 text-slate-800 dark:text-slate-200 truncate max-w-[120px]" title={p.title}>
                            {p.title}
                          </td>
                          <td className="py-1 px-1 text-right font-mono text-emerald-600 dark:text-emerald-400">
                            {p.conversion_rate != null ? `${p.conversion_rate}%` : '-'}
                          </td>
                          <td className="py-1 px-1 text-right font-mono text-slate-600 dark:text-slate-300">
                            {p.conversion_count != null ? formatViews(p.conversion_count) : '-'}
                          </td>
                          <td className="py-1 px-1 text-right font-mono text-slate-600 dark:text-slate-300">
                            {p.read_through_rate != null ? `${p.read_through_rate}%` : p.avg_read_through > 0 ? `${p.avg_read_through}%` : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Non-converted top growers */}
            {funnel.data.non_converted.length > 0 && (
              <div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-1">미전환 성장 상위 작품</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                        <th className="text-left py-1 px-1">작품</th>
                        <th className="text-right py-1 px-1">일평균 성장</th>
                        <th className="text-right py-1 px-1">총 조회수</th>
                        <th className="text-right py-1 px-1">연독률</th>
                      </tr>
                    </thead>
                    <tbody>
                      {funnel.data.non_converted.slice(0, 5).map((p) => (
                        <tr key={p.novel_id} className="border-b border-slate-100 dark:border-slate-700/50">
                          <td className="py-1 px-1 text-slate-800 dark:text-slate-200 truncate max-w-[120px]" title={p.title}>
                            {p.title}
                          </td>
                          <td className="py-1 px-1 text-right font-mono text-blue-600 dark:text-blue-400">
                            {formatViews(p.avg_daily_growth)}
                          </td>
                          <td className="py-1 px-1 text-right font-mono text-slate-600 dark:text-slate-300">
                            {formatViews(p.final_views)}
                          </td>
                          <td className="py-1 px-1 text-right font-mono text-slate-600 dark:text-slate-300">
                            {p.avg_read_through > 0 ? `${p.avg_read_through}%` : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null)}
    </div>
  );
}

/* ─── Heatmap Table Component ─── */

function HeatmapTable({ data }: { data: Array<{ genre: string; platform: string; avg_views: number; count: number }> }) {
  // Build unique genres and platforms
  const genres = useMemo(() => [...new Set(data.map((d) => d.genre))].sort(), [data]);
  const platforms = useMemo(() => [...new Set(data.map((d) => d.platform))].sort(), [data]);

  // Build lookup: genre -> platform -> count
  const lookup = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const d of data) {
      if (!map[d.genre]) map[d.genre] = {};
      map[d.genre][d.platform] = d.count;
    }
    return map;
  }, [data]);

  const maxCount = useMemo(
    () => Math.max(...data.map((d) => d.count), 1),
    [data],
  );

  // Show up to 10 genres and all platforms
  const displayGenres = genres.slice(0, 10);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[10px]">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-700">
            <th className="text-left py-1 px-1 text-slate-500 dark:text-slate-400 sticky left-0 bg-white dark:bg-slate-800">장르</th>
            {platforms.map((p) => (
              <th key={p} className="text-center py-1 px-1 text-slate-500 dark:text-slate-400">
                <span className="inline-block w-1.5 h-1.5 rounded-full mr-0.5" style={{ backgroundColor: PLATFORM_COLORS[normalizePlatform(p)] || '#9ca3af' }} />
                {normalizePlatform(p)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayGenres.map((genre) => (
            <tr key={genre} className="border-b border-slate-100 dark:border-slate-700/50">
              <td className="py-1 px-1 text-slate-700 dark:text-slate-300 font-medium sticky left-0 bg-white dark:bg-slate-800 max-w-[80px] truncate" title={genre}>
                {genre}
              </td>
              {platforms.map((p) => {
                const count = lookup[genre]?.[p] || 0;
                const intensity = count / maxCount;
                return (
                  <td key={p} className="py-1 px-1 text-center">
                    {count > 0 ? (
                      <span
                        className="inline-block px-1.5 py-0.5 rounded text-white font-mono"
                        style={{
                          backgroundColor: `rgba(99,102,241,${Math.max(intensity * 0.9, 0.15)})`,
                        }}
                      >
                        {count}
                      </span>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600">-</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {genres.length > 10 && (
        <p className="text-[10px] text-slate-400 mt-1">... 외 {genres.length - 10}개 장르</p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   롱텀 분석 섹션 컴포넌트들
   ═══════════════════════════════════════════ */

function SeasonalitySection({ db }: { db: import('sql.js').Database }) {
  const result = useMemo(() => analyzeSeasonality(db, 12), [db]);
  if (result.error) return <ErrorBlock error={result.error} />;
  if (!result.data) return null;
  const d = result.data;
  return (
    <div className="space-y-3">
      {d.day_of_week?.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
          <SectionTitle>요일별 평균 랭킹 진입수</SectionTitle>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={d.day_of_week}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip {...tooltipStyle} /><Bar dataKey="avg_entries" fill="#6366f1"></ Bar></BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {d.quarterly_growth?.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
          <SectionTitle>분기별 성장률</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            {d.quarterly_growth.map((q: any, i: number) => (
              <StatBox key={i} label={q.quarter} value={`${q.growth_pct >= 0 ? '+' : ''}${q.growth_pct}%`} sub={`조회수 ${formatViews(q.total_views)}`} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RankingTenureSection({ db }: { db: import('sql.js').Database }) {
  const result = useMemo(() => analyzeRankingTenure(db, 6), [db]);
  if (result.error) return <ErrorBlock error={result.error} />;
  if (!result.data) return null;
  const d = result.data;
  return (
    <div className="space-y-3">
      <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
        <SectionTitle>랭킹 체류 티어 분포</SectionTitle>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <StatBox label="1~3일" value={d.tier_distribution?.['1_to_3_days'] ?? 0} sub="단기" />
          <StatBox label="4~7일" value={d.tier_distribution?.['4_to_7_days'] ?? 0} sub="단기" />
          <StatBox label="8~14일" value={d.tier_distribution?.['8_to_14_days'] ?? 0} sub="중기" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <StatBox label="15~30일" value={d.tier_distribution?.['15_to_30_days'] ?? 0} sub="장기" />
          <StatBox label="31일+" value={d.tier_distribution?.['31_plus_days'] ?? 0} sub="스테디셀러" />
        </div>
      </div>
      {d.top_novels?.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
          <SectionTitle>TOP 체류 작품</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead><tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500"><th className="text-left p-1">작품</th><th className="text-right p-1">체류일</th><th className="text-right p-1">연속</th><th className="text-right p-1">최고</th></tr></thead>
              <tbody>
                {d.top_novels.slice(0, 15).map((n: any, i: number) => (
                  <tr key={i} className="border-b border-slate-100 dark:border-slate-700/50">
                    <td className="p-1 truncate max-w-[120px] text-slate-800 dark:text-slate-200">{n.title}</td>
                    <td className="p-1 text-right font-bold text-indigo-600 dark:text-indigo-400">{n.total_days}</td>
                    <td className="p-1 text-right text-emerald-600">{n.max_streak}</td>
                    <td className="p-1 text-right">{n.best_rank}위</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function PublisherMarketSection({ db }: { db: import('sql.js').Database }) {
  const result = useMemo(() => analyzePublisherMarket(db, 12), [db]);
  if (result.error) return <ErrorBlock error={result.error} />;
  if (!result.data) return null;
  const d = result.data;
  return (
    <div className="space-y-3">
      {d.hhi_trend?.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
          <SectionTitle>시장 집중도 추이 (HHI)</SectionTitle>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <StatBox label="최근 HHI" value={d.hhi_trend[d.hhi_trend.length - 1]?.hhi ?? '-'} />
            <StatBox label="CR3" value={`${d.hhi_trend[d.hhi_trend.length - 1]?.cr3 ?? '-'}%`} />
            <StatBox label="CR5" value={`${d.hhi_trend[d.hhi_trend.length - 1]?.cr5 ?? '-'}%`} />
          </div>
        </div>
      )}
      {d.prolific_authors?.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
          <SectionTitle>다작 작가 (2+작품 동시 랭킹)</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead><tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500"><th className="text-left p-1">작가</th><th className="text-right p-1">작품수</th><th className="text-right p-1">동시비율</th></tr></thead>
              <tbody>
                {d.prolific_authors.slice(0, 10).map((a: any, i: number) => (
                  <tr key={i} className="border-b border-slate-100 dark:border-slate-700/50">
                    <td className="p-1 text-slate-800 dark:text-slate-200">{a.author}</td>
                    <td className="p-1 text-right font-bold text-indigo-600">{a.unique_titles}</td>
                    <td className="p-1 text-right text-amber-600">{a.multi_ratio}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function KeywordTrendSection({ db }: { db: import('sql.js').Database }) {
  const result = useMemo(() => analyzeKeywordTrend(db, 12, 20), [db]);
  if (result.error) return <ErrorBlock error={result.error} />;
  if (!result.data) return null;
  const d = result.data;
  return (
    <div className="space-y-3">
      {(d.rising?.length > 0 || d.falling?.length > 0) && (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
          <SectionTitle>급상승 / 하락 키워드</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[10px] text-emerald-600 font-semibold mb-1">🔥 급상승</p>
              {(d.rising || []).slice(0, 5).map((k: any, i: number) => (
                <div key={i} className="flex justify-between text-[10px] py-0.5"><span className="text-slate-700 dark:text-slate-300">{k.keyword}</span><span className="text-emerald-600 font-bold">+{k.change_pct}%</span></div>
              ))}
            </div>
            <div>
              <p className="text-[10px] text-red-600 font-semibold mb-1">📉 하락</p>
              {(d.falling || []).slice(0, 5).map((k: any, i: number) => (
                <div key={i} className="flex justify-between text-[10px] py-0.5"><span className="text-slate-700 dark:text-slate-300">{k.keyword}</span><span className="text-red-600 font-bold">{k.change_pct}%</span></div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GenreEcosystemSection({ db }: { db: import('sql.js').Database }) {
  const result = useMemo(() => analyzeGenreEcosystem(db, 12), [db]);
  if (result.error) return <ErrorBlock error={result.error} />;
  if (!result.data) return null;
  const d = result.data;
  return (
    <div className="space-y-3">
      {(d.rising_genres?.length > 0 || d.declining_genres?.length > 0) && (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
          <SectionTitle>신흥 / 쇠퇴 장르</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[10px] text-emerald-600 font-semibold mb-1">📈 신흥</p>
              {(d.rising_genres || []).map((g: any, i: number) => (
                <div key={i} className="flex justify-between text-[10px] py-0.5"><span className="text-slate-700 dark:text-slate-300">{g.genre}</span><span className="text-emerald-600 font-bold">+{g.change_pct}%</span></div>
              ))}
            </div>
            <div>
              <p className="text-[10px] text-red-600 font-semibold mb-1">📉 쇠퇴</p>
              {(d.declining_genres || []).map((g: any, i: number) => (
                <div key={i} className="flex justify-between text-[10px] py-0.5"><span className="text-slate-700 dark:text-slate-300">{g.genre}</span><span className="text-red-600 font-bold">{g.change_pct}%</span></div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PromotionEffectSection({ db }: { db: import('sql.js').Database }) {
  const result = useMemo(() => analyzePromotionEffect(db, 12), [db]);
  if (result.error) return <ErrorBlock error={result.error} />;
  if (!result.data) return null;
  const d = result.data;
  return (
    <div className="space-y-3">
      <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
        <SectionTitle>프로모션 효과 요약</SectionTitle>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <StatBox label="프로모션 이벤트" value={d.overall_summary?.total_events ?? 0} />
          <StatBox label="평균 lift" value={`${d.overall_summary?.avg_lift_pct ?? 0}%`} />
          <StatBox label="효과 있음" value={d.overall_summary?.positive_events ?? 0} sub="조회수 상승" />
          <StatBox label="역효과" value={d.overall_summary?.negative_events ?? 0} sub="조회수 하락" />
        </div>
        {d.overall_summary?.total_events === 0 && (
          <p className="text-center text-slate-400 text-xs py-4">프로모션 데이터가 없습니다.</p>
        )}
      </div>
    </div>
  );
}
