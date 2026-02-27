/**
 * Deep Analysis Service — 브라우저 내 통계 분석 (sql.js 기반)
 *
 * 8개 분석 중:
 * - 7개 구현 (이동평균 분해, MA 예측, Kaplan-Meier 생존, 시장 집중도, TF-IDF, 교차 플랫폼, 전환 퍼널)
 * - 1개 (ARIMA/statsmodels 기반 고급 예측)은 "데스크톱 전용" 안내
 *
 * 참조: backend/services/deep_analysis/*.py 알고리즘을 TypeScript로 포팅
 */
import type { Database } from 'sql.js';
import {
  getStatsByNovelIdSince,
  getAllStatsSince,
  getRankingAppearances,
  getConcentrationData,
  getTitlesByPlatform,
  getAuthorPlatformPairs,
  getGenrePlatformHeatmap,
  getMunpiaDetailData,
} from '../db/queries';

// ─── 공통 타입 ───

interface AnalysisResult<T> {
  error: string | null;
  data: T | null;
}

interface DateValue {
  date: string;
  value: number | null;
}

// ─── 유틸 ───

/** N일 전 날짜 문자열 (YYYY-MM-DD) */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/** 오늘 날짜 문자열 */
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 날짜 문자열 → Date 객체 (UTC) */
function parseDate(s: string): Date {
  return new Date(s + 'T00:00:00Z');
}

/** 두 날짜 사이의 일수 차이 */
function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000);
}

/** 배열 평균 */
function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/** 날짜의 요일 인덱스 (0=일, 1=월, ..., 6=토) */
function dayOfWeek(dateStr: string): number {
  return parseDate(dateStr).getUTCDay();
}

/** 반올림 (소수점 n자리) */
function round(v: number, decimals = 2): number {
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
}

/** 백분위수 계산 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// ─── 불용어 & 토크나이저 (text_mining.py 포팅) ───

const STOPWORDS = new Set([
  '의', '에', '는', '은', '이', '가', '를', '을', '과', '와', '로', '으로',
  '에서', '한', '하는', '된', '되는', '그', '저', '이런', '그런', '나',
  '내', '너', '당신', '우리', '것', '수', '중', '더', '안', '못',
]);

function tokenizeTitle(title: string): string[] {
  if (!title) return [];
  const cleaned = title.replace(/[^\w가-힣a-zA-Z0-9\s]/g, ' ');
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const result = tokens.filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  // 폴백: 2글자 이상 없으면 1글자도 허용
  if (result.length === 0) {
    return tokens.filter((t) => t.length >= 1 && !STOPWORDS.has(t));
  }
  return result;
}

// ─── A. 시계열 분해 (이동평균) ───

interface DecompositionData {
  period: number;
  data_points: number;
  model: string;
  original: DateValue[];
  trend: DateValue[];
  seasonal: DateValue[];
  residual: DateValue[];
}

/**
 * 소설별 일일 조회수 증가분 시계열 추출
 */
function getNovelDailyViews(
  db: Database,
  novelId: number,
  days: number,
): { dates: string[]; values: number[] } {
  const sinceDate = daysAgo(days);
  const rows = getStatsByNovelIdSince(db, novelId, sinceDate);
  if (rows.length === 0) return { dates: [], values: [] };

  const dates = rows.map((r) => r.date);
  const cumViews = rows.map((r) => Number(r.views) || 0);

  // 누적 조회수 -> 일일 증가분
  const deltas = [0];
  for (let i = 1; i < cumViews.length; i++) {
    deltas.push(Math.max(cumViews[i] - cumViews[i - 1], 0));
  }

  return { dates, values: deltas };
}

/**
 * 플랫폼 전체 일별 총 조회수 증가분 (소설별 차분 먼저, 날짜별 합산)
 */
function getDailyTotalViews(
  db: Database,
  platform: string | undefined,
  days: number,
): { dates: string[]; values: number[] } {
  const sinceDate = daysAgo(days);
  const rows = getAllStatsSince(
    db,
    sinceDate,
    platform && platform !== 'all' ? platform : undefined,
  );

  if (rows.length === 0) return { dates: [], values: [] };

  // 소설별 차분 계산 후 날짜별 합산
  const novelPrev: Record<number, number> = {};
  const dateDeltas: Record<string, number> = {};

  for (const { novel_id, date, views } of rows) {
    const v = Number(views) || 0;
    if (novel_id in novelPrev) {
      const delta = Math.max(v - novelPrev[novel_id], 0);
      dateDeltas[date] = (dateDeltas[date] || 0) + delta;
    }
    novelPrev[novel_id] = v;
  }

  const sortedDates = Object.keys(dateDeltas).sort();
  if (sortedDates.length === 0) return { dates: [], values: [] };

  return {
    dates: sortedDates,
    values: sortedDates.map((d) => dateDeltas[d]),
  };
}

/**
 * 7-day 이동평균 기반 시계열 분해
 *
 * trend = 7일 이동평균
 * seasonal = 요일별 평균 편차 (원본 - trend)
 * residual = 원본 - trend - seasonal
 */
export function analyzeDecomposition(
  db: Database,
  platform?: string,
  novelId?: number,
  days: number = 90,
): AnalysisResult<DecompositionData> {
  const { dates, values } = novelId
    ? getNovelDailyViews(db, novelId, days)
    : getDailyTotalViews(db, platform, days);

  if (values.length < 14) {
    return {
      error: `시계열 분해에 최소 14일 이상의 데이터가 필요합니다 (현재: ${values.length}일). 일간 조회수를 더 수집해주세요.`,
      data: null,
    };
  }

  const n = values.length;
  const period = Math.min(7, Math.floor(n / 3));
  const half = Math.floor(period / 2);

  // 1) Trend: centered moving average (양쪽 끝은 extend)
  const trend: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(n - 1, i + half);
    let sum = 0;
    let cnt = 0;
    for (let j = lo; j <= hi; j++) {
      sum += values[j];
      cnt++;
    }
    trend[i] = cnt > 0 ? sum / cnt : null;
  }

  // 2) Seasonal: 요일별 평균 (original - trend)
  const dowSums: number[] = [0, 0, 0, 0, 0, 0, 0];
  const dowCounts: number[] = [0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    if (trend[i] !== null) {
      const dow = dayOfWeek(dates[i]);
      dowSums[dow] += values[i] - trend[i]!;
      dowCounts[dow]++;
    }
  }
  const dowAvg = dowSums.map((s, idx) => (dowCounts[idx] > 0 ? s / dowCounts[idx] : 0));
  // 중심 보정: seasonal 평균 = 0
  const seasonalMean = mean(dowAvg);
  const seasonalByDow = dowAvg.map((v) => v - seasonalMean);

  const seasonal: number[] = dates.map((d) => seasonalByDow[dayOfWeek(d)]);

  // 3) Residual
  const residual: (number | null)[] = trend.map((t, i) =>
    t !== null ? values[i] - t - seasonal[i] : null,
  );

  // 결과 포맷
  const original: DateValue[] = dates.map((d, i) => ({ date: d, value: round(values[i]) }));
  const trendData: DateValue[] = dates.map((d, i) => ({
    date: d,
    value: trend[i] !== null ? round(trend[i]!) : null,
  }));
  const seasonalData: DateValue[] = dates.map((d, i) => ({ date: d, value: round(seasonal[i]) }));
  const residualData: DateValue[] = dates.map((d, i) => ({
    date: d,
    value: residual[i] !== null ? round(residual[i]!) : null,
  }));

  return {
    error: null,
    data: {
      period,
      data_points: n,
      model: 'Additive (이동평균)',
      original,
      trend: trendData,
      seasonal: seasonalData,
      residual: residualData,
    },
  };
}

// ─── B. 시계열 예측 (MA 외삽) ───

interface ForecastPoint {
  date: string;
  predicted: number;
  ci_lower: number;
  ci_upper: number;
}

interface ForecastData {
  model: string;
  aic: number | null;
  forecast_days: number;
  history: DateValue[];
  forecast: ForecastPoint[];
  notice?: string;
}

/**
 * 이동평균 기반 예측 (ARIMA 없이)
 * - 최근 7일 평균을 forecast value로 사용
 * - CI: +/- 30%
 */
export function analyzeForecast(
  db: Database,
  platform?: string,
  novelId?: number,
  forecastDays: number = 30,
): AnalysisResult<ForecastData> {
  const { dates, values } = novelId
    ? getNovelDailyViews(db, novelId, 180)
    : getDailyTotalViews(db, platform, 180);

  if (values.length < 7) {
    return {
      error: `예측에 최소 7일 이상의 데이터가 필요합니다 (현재: ${values.length}일). 일간 조회수를 수집해주세요.`,
      data: null,
    };
  }

  const window = Math.min(7, values.length);
  const recent = values.slice(-window);
  const ma = mean(recent);

  // Forecast
  const lastDate = dates[dates.length - 1];
  const forecast: ForecastPoint[] = [];
  for (let i = 0; i < forecastDays; i++) {
    const fd = new Date(parseDate(lastDate));
    fd.setUTCDate(fd.getUTCDate() + i + 1);
    const dateStr = fd.toISOString().slice(0, 10);
    forecast.push({
      date: dateStr,
      predicted: round(ma),
      ci_lower: round(ma * 0.7),
      ci_upper: round(ma * 1.3),
    });
  }

  // History (last 30 days)
  const histSlice = Math.min(30, dates.length);
  const history: DateValue[] = dates
    .slice(-histSlice)
    .map((d, i) => ({ date: d, value: round(values[values.length - histSlice + i]) }));

  return {
    error: null,
    data: {
      model: `이동평균(MA-${window}) [웹 뷰어 — ARIMA는 데스크톱 전용]`,
      aic: null,
      forecast_days: forecastDays,
      history,
      forecast,
      notice:
        values.length >= 30
          ? '웹 뷰어에서는 이동평균(MA) 예측만 지원합니다. ARIMA 기반 정밀 예측은 데스크톱 앱에서 사용 가능합니다.'
          : `데이터가 ${values.length}일분이라 이동평균으로 예측했습니다.`,
    },
  };
}

// ─── C. Kaplan-Meier 생존 분석 ───

interface SurvivalCurve {
  group: string;
  n: number;
  events: number;
  censored: number;
  timeline: number[];
  survival_prob: number[];
}

interface SurvivalData {
  group_by: string;
  total_groups: number;
  curves: SurvivalCurve[];
  median_survival: Record<string, number | null>;
}

/**
 * 랭킹 생존 분석 (Kaplan-Meier)
 *
 * - 작품이 랭킹에 처음 등장한 날 = 진입
 * - 연속 7일 미등장 = 이탈(event)
 * - S(t) = 누적곱(1 - events/at_risk)
 */
export function analyzeSurvival(
  db: Database,
  groupBy: 'platform' | 'genre' = 'platform',
): AnalysisResult<SurvivalData> {
  // 최근 180일 데이터
  const sinceDate = daysAgo(180);
  const rows = getRankingAppearances(db, sinceDate);

  if (rows.length === 0) {
    return {
      error:
        '생존 분석을 위해 랭킹 데이터가 필요합니다.\n\n' +
        'Kaplan-Meier 생존 분석 작동 원리:\n' +
        '- 작품이 랭킹(TOP 50)에 처음 등장한 날 = "진입"\n' +
        '- 연속 7일 미등장 시 = "이탈" (생존 종료 이벤트)\n' +
        '- 최근 7일 내 등장 = "아직 생존 중" (중도절단)\n' +
        '- 각 플랫폼/장르별 최소 5개 작품의 진입/이탈 데이터 필요\n\n' +
        '사이드바 "웹소설 라이브러리 > 플랫폼 랭킹 수집"을 3~5일 이상 실행해주세요.',
      data: null,
    };
  }

  // 그룹별 작품 → 등장 날짜 수집
  const titleDates: Record<string, Record<string, string[]>> = {}; // group → title → dates[]
  for (const r of rows) {
    const group = groupBy === 'platform' ? r.platform : r.genre;
    if (!group) continue;
    if (!titleDates[group]) titleDates[group] = {};
    if (!titleDates[group][r.title]) titleDates[group][r.title] = [];
    titleDates[group][r.title].push(r.ranking_date);
  }

  // 그룹별 생존 데이터 계산
  const today = todayStr();
  const survivalByGroup: Record<string, Array<{ duration: number; event: number }>> = {};

  for (const [group, titles] of Object.entries(titleDates)) {
    survivalByGroup[group] = [];

    for (const [, datesList] of Object.entries(titles)) {
      const sortedDates = [...new Set(datesList)].sort();
      if (sortedDates.length < 1) continue;

      const firstDate = sortedDates[0];

      // 연속 등장 기간: 7일 이상 gap이면 이탈
      let prev = firstDate;
      for (let i = 1; i < sortedDates.length; i++) {
        const gap = daysBetween(prev, sortedDates[i]);
        if (gap > 7) break;
        prev = sortedDates[i];
      }

      const duration = daysBetween(firstDate, prev) + 1;
      const lastDate = sortedDates[sortedDates.length - 1];
      // 최근 7일 이내 등장 = censored(아직 생존)
      const event = daysBetween(lastDate, today) <= 7 ? 0 : 1;

      survivalByGroup[group].push({ duration, event });
    }
  }

  // Kaplan-Meier 추정
  const curves: SurvivalCurve[] = [];
  const medianSurvival: Record<string, number | null> = {};

  for (const [group, records] of Object.entries(survivalByGroup)) {
    if (records.length < 5) continue;

    const n = records.length;
    const events = records.filter((r) => r.event === 1).length;

    // 고유 시간 지점(duration)에서 S(t) 계산
    const uniqueTimes = [...new Set(records.map((r) => r.duration))].sort((a, b) => a - b);

    const timeline: number[] = [0];
    const survProb: number[] = [1.0];
    let cumSurvival = 1.0;

    for (const t of uniqueTimes) {
      // 시간 t에서 위험 집합 크기 (아직 이탈/중도절단되지 않은 대상 수)
      const atRisk = records.filter((r) => r.duration >= t).length;
      // 시간 t에서 이벤트 수
      const eventsAtT = records.filter((r) => r.duration === t && r.event === 1).length;

      if (atRisk > 0 && eventsAtT > 0) {
        cumSurvival *= 1 - eventsAtT / atRisk;
      }

      timeline.push(t);
      survProb.push(round(cumSurvival, 4));
    }

    curves.push({
      group,
      n,
      events,
      censored: n - events,
      timeline,
      survival_prob: survProb,
    });

    // 중위 생존 시간: S(t) <= 0.5인 최초 t
    let median: number | null = null;
    for (let i = 0; i < survProb.length; i++) {
      if (survProb[i] <= 0.5) {
        median = timeline[i];
        break;
      }
    }
    medianSurvival[group] = median;
  }

  // 중위 생존 시간 기준 정렬 (오래 생존하는 그룹이 앞)
  curves.sort(
    (a, b) => (medianSurvival[b.group] ?? 999) - (medianSurvival[a.group] ?? 999),
  );

  return {
    error: null,
    data: {
      group_by: groupBy,
      total_groups: curves.length,
      curves,
      median_survival: medianSurvival,
    },
  };
}

// ─── D. 시장 집중도 ───

interface ShareItem {
  name: string;
  count: number;
  share: number;
}

interface LorenzPoint {
  cumulative_population: number;
  cumulative_share: number;
}

interface ConcentrationData {
  dimension: string;
  data_source: string;
  period_days: number | null;
  total_entries: number;
  unique_entities: number;
  hhi: number;
  hhi_interpretation: string;
  gini: number;
  cr3: number;
  cr5: number;
  shares: ShareItem[];
  lorenz_curve: LorenzPoint[];
  notice?: string;
}

function computeHHI(shares: number[]): number {
  return shares.reduce((sum, s) => sum + s * s, 0) * 10000;
}

function computeGini(values: number[]): number {
  if (values.length === 0) return 0;
  const total = values.reduce((s, v) => s + v, 0);
  if (total === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  let numerator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (i + 1) * sorted[i];
  }
  const cumsum = sorted.reduce((s, v) => s + v, 0);
  return (2 * numerator - (n + 1) * cumsum) / (n * cumsum);
}

function computeCR(shares: number[], k: number): number {
  const sorted = [...shares].sort((a, b) => b - a);
  return sorted.slice(0, k).reduce((s, v) => s + v, 0);
}

/**
 * 시장 집중도 분석: HHI, Gini, CR3, CR5, Lorenz curve
 */
export function analyzeConcentration(
  db: Database,
  dimension: 'publisher' | 'genre' | 'platform' = 'publisher',
): AnalysisResult<ConcentrationData> {
  const sinceDate = daysAgo(30);
  const rows = getConcentrationData(db, dimension, sinceDate);

  if (rows.length === 0) {
    return {
      error: null,
      data: {
        dimension,
        data_source: 'none',
        period_days: null,
        total_entries: 0,
        unique_entities: 0,
        hhi: 0,
        hhi_interpretation: '데이터 없음',
        gini: 0,
        cr3: 0,
        cr5: 0,
        shares: [],
        lorenz_curve: [],
      },
    };
  }

  const total = rows.reduce((s, r) => s + r.cnt, 0);
  const sharesList: ShareItem[] = rows.map((r) => ({
    name: r.name || '미분류',
    count: r.cnt,
    share: round(total > 0 ? r.cnt / total : 0, 4),
  }));

  const shareValues = sharesList.map((s) => s.share);
  const countValues = sharesList.map((s) => s.count);

  const hhi = computeHHI(shareValues);
  const gini = computeGini(countValues);
  const cr3 = computeCR(shareValues, 3);
  const cr5 = computeCR(shareValues, 5);

  // Lorenz curve
  const sortedCounts = [...countValues].sort((a, b) => a - b);
  const n = sortedCounts.length;
  let cumSum = 0;
  const totalCount = sortedCounts.reduce((s, v) => s + v, 0) || 1;
  const lorenz: LorenzPoint[] = [{ cumulative_population: 0, cumulative_share: 0 }];
  for (let i = 0; i < n; i++) {
    cumSum += sortedCounts[i];
    lorenz.push({
      cumulative_population: round((i + 1) / n, 4),
      cumulative_share: round(cumSum / totalCount, 4),
    });
  }

  const hhiInterpretation =
    hhi > 2500 ? '높은 집중 (고집중)' : hhi > 1500 ? '중간 집중' : '낮은 집중 (경쟁적)';

  return {
    error: null,
    data: {
      dimension,
      data_source: 'ranking',
      period_days: 30,
      total_entries: total,
      unique_entities: rows.length,
      hhi: round(hhi, 1),
      hhi_interpretation: hhiInterpretation,
      gini: round(gini, 4),
      cr3: round(cr3, 4),
      cr5: round(cr5, 4),
      shares: sharesList.slice(0, 30),
      lorenz_curve: lorenz,
    },
  };
}

// ─── E. TF-IDF 키워드 ───

interface TfidfKeyword {
  word: string;
  score: number;
  doc_freq: number;
}

interface TfidfPlatform {
  platform: string;
  doc_count: number;
  keywords: TfidfKeyword[];
}

interface NetworkNode {
  id: string;
  label: string;
  frequency: number;
  centrality: number;
}

interface NetworkEdge {
  source: string;
  target: string;
  weight: number;
}

interface AssociationRule {
  keywords: string[];
  count: number;
  support: number;
}

interface TfidfData {
  tfidf_by_platform: TfidfPlatform[];
  network: {
    nodes: NetworkNode[];
    edges: NetworkEdge[];
  };
  associations: AssociationRule[];
  notice?: string;
}

/**
 * TF-IDF 키워드 분석 + 공출현 네트워크 + 연관규칙
 *
 * TF = 단어 빈도 / 문서 내 총 토큰 수
 * IDF = log(총 문서 수 / 해당 단어가 등장한 문서 수)
 */
export function analyzeTfidf(
  db: Database,
  topN: number = 30,
): AnalysisResult<TfidfData> {
  const rows = getTitlesByPlatform(db);

  if (rows.length === 0) {
    return {
      error: '분석할 데이터가 부족합니다. 소설을 등록하거나 랭킹을 수집해주세요.',
      data: null,
    };
  }

  // 플랫폼별 문서(토큰 리스트) 그룹화
  const platformDocs: Record<string, string[][]> = {};
  const allTitles: string[][] = [];

  for (const { platform, title } of rows) {
    const tokens = tokenizeTitle(title);
    if (tokens.length === 0) continue;
    const p = platform || '미분류';
    if (!platformDocs[p]) platformDocs[p] = [];
    platformDocs[p].push(tokens);
    allTitles.push(tokens);
  }

  if (allTitles.length === 0) {
    return {
      error: '분석할 제목이 없습니다.',
      data: null,
    };
  }

  // TF-IDF 계산 (플랫폼별)
  const tfidfByPlatform: TfidfPlatform[] = [];
  const totalDocs = allTitles.length;

  // 전체 문서의 단어별 문서 빈도 (IDF 계산용)
  const globalDF: Record<string, number> = {};
  for (const tokens of allTitles) {
    const unique = new Set(tokens);
    for (const t of unique) {
      globalDF[t] = (globalDF[t] || 0) + 1;
    }
  }

  for (const [plat, docs] of Object.entries(platformDocs)) {
    if (docs.length === 0) continue;

    // 플랫폼 내 단어 빈도 + TF-IDF 합산
    const wordScores: Record<string, { tfidfSum: number; df: number }> = {};

    for (const tokens of docs) {
      const tf: Record<string, number> = {};
      for (const t of tokens) {
        tf[t] = (tf[t] || 0) + 1;
      }
      const totalTokens = tokens.length;

      for (const [word, freq] of Object.entries(tf)) {
        const tfVal = freq / totalTokens;
        const idfVal = Math.log((totalDocs + 1) / ((globalDF[word] || 0) + 1)) + 1; // smoothed IDF
        const tfidf = tfVal * idfVal;

        if (!wordScores[word]) {
          wordScores[word] = { tfidfSum: 0, df: 0 };
        }
        wordScores[word].tfidfSum += tfidf;
        wordScores[word].df++;
      }
    }

    // 평균 TF-IDF 점수로 정렬
    const keywords: TfidfKeyword[] = Object.entries(wordScores)
      .map(([word, { tfidfSum, df }]) => ({
        word,
        score: round(tfidfSum / docs.length, 4),
        doc_freq: df,
      }))
      .filter((k) => k.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);

    tfidfByPlatform.push({
      platform: plat,
      doc_count: docs.length,
      keywords,
    });
  }

  // 공출현 네트워크
  const network = buildCooccurrenceNetwork(allTitles, 40);

  // 연관규칙
  const associations = findAssociations(allTitles, 2);

  return {
    error: null,
    data: {
      tfidf_by_platform: tfidfByPlatform,
      network,
      associations: associations.slice(0, 30),
    },
  };
}

/**
 * 키워드 공출현 네트워크 구축 (text_mining.py _build_cooccurrence_network 포팅)
 */
function buildCooccurrenceNetwork(
  allTitles: string[][],
  topN: number = 40,
): { nodes: NetworkNode[]; edges: NetworkEdge[] } {
  // 키워드 빈도
  const wordFreq: Record<string, number> = {};
  for (const tokens of allTitles) {
    const unique = new Set(tokens);
    for (const t of unique) {
      wordFreq[t] = (wordFreq[t] || 0) + 1;
    }
  }

  // 상위 N개 단어
  const topWords = new Set(
    Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([w]) => w),
  );

  // 공출현 빈도
  const cooccurrence: Record<string, number> = {};
  for (const tokens of allTitles) {
    const filtered = [...new Set(tokens)].filter((t) => topWords.has(t));
    for (let i = 0; i < filtered.length; i++) {
      for (let j = i + 1; j < filtered.length; j++) {
        const pair = [filtered[i], filtered[j]].sort().join('|||');
        cooccurrence[pair] = (cooccurrence[pair] || 0) + 1;
      }
    }
  }

  // 에지 + 노드 degree
  const nodeDegree: Record<string, number> = {};
  const edges: NetworkEdge[] = [];
  const sortedPairs = Object.entries(cooccurrence)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 100);

  for (const [pairKey, weight] of sortedPairs) {
    if (weight < 2) continue;
    const [w1, w2] = pairKey.split('|||');
    edges.push({ source: w1, target: w2, weight });
    nodeDegree[w1] = (nodeDegree[w1] || 0) + weight;
    nodeDegree[w2] = (nodeDegree[w2] || 0) + weight;
  }

  const maxDegree = Math.max(...Object.values(nodeDegree), 1);
  const nodes: NetworkNode[] = [];
  for (const word of topWords) {
    if (nodeDegree[word]) {
      nodes.push({
        id: word,
        label: word,
        frequency: wordFreq[word] || 0,
        centrality: round(nodeDegree[word] / maxDegree, 4),
      });
    }
  }
  nodes.sort((a, b) => b.centrality - a.centrality);

  return { nodes: nodes.slice(0, topN), edges };
}

/**
 * 키워드 2개 조합의 연관규칙 (text_mining.py _find_associations 포팅)
 */
function findAssociations(allTitles: string[][], minSupport: number = 2): AssociationRule[] {
  const pairCount: Record<string, number> = {};
  const total = allTitles.length;

  for (const tokens of allTitles) {
    const unique = [...new Set(tokens)];
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const pair = [unique[i], unique[j]].sort().join('|||');
        pairCount[pair] = (pairCount[pair] || 0) + 1;
      }
    }
  }

  const results: AssociationRule[] = Object.entries(pairCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .filter(([, count]) => count >= minSupport)
    .map(([pairKey, count]) => ({
      keywords: pairKey.split('|||'),
      count,
      support: round(total > 0 ? count / total : 0, 4),
    }));

  return results;
}

// ─── F. 크로스 플랫폼 분석 ───

interface HeatmapCell {
  genre: string;
  platform: string;
  avg_views: number;
  count: number;
}

interface PlatformSynergy {
  combo: string;
  author_count: number;
}

interface PlatformDistribution {
  platform: string;
  total: number;
  distribution: Array<{ genre: string; count: number; ratio: number }>;
}

interface CrossPlatformData {
  genre_platform_heatmap: HeatmapCell[];
  platform_synergy: PlatformSynergy[];
  single_platform_authors: number;
  multi_platform_authors: number;
  platform_distributions: PlatformDistribution[];
  notice?: string;
}

/**
 * 크로스 플랫폼 교차 분석:
 * 1) 장르 x 플랫폼 히트맵
 * 2) 작가 다중 플랫폼 탐지
 * 3) 플랫폼 시너지 (작가가 공유하는 플랫폼 조합)
 * 4) 플랫폼별 장르 분포
 */
export function analyzeCrossPlatform(db: Database): AnalysisResult<CrossPlatformData> {
  const sinceDate = daysAgo(30);

  // 1. 장르 x 플랫폼 히트맵
  const heatmapRows = getGenrePlatformHeatmap(db, sinceDate);
  const genrePlatformHeatmap: HeatmapCell[] = heatmapRows.map((r) => ({
    genre: r.genre,
    platform: r.platform,
    avg_views: round(Number(r.avg_views) || 0),
    count: r.count,
  }));

  // 2. 작가 다중 플랫폼 분석
  const authorPairs = getAuthorPlatformPairs(db, sinceDate);
  const authorPlatformMap: Record<string, Set<string>> = {};
  for (const { author, platform } of authorPairs) {
    if (!author || !platform) continue;
    const key = author.trim();
    if (!authorPlatformMap[key]) authorPlatformMap[key] = new Set();
    authorPlatformMap[key].add(platform);
  }

  let singlePlatform = 0;
  let multiPlatform = 0;
  const platformCombos: Record<string, number> = {};

  for (const [, platforms] of Object.entries(authorPlatformMap)) {
    if (platforms.size === 1) {
      singlePlatform++;
    } else {
      multiPlatform++;
      const combo = [...platforms].sort().join(' + ');
      platformCombos[combo] = (platformCombos[combo] || 0) + 1;
    }
  }

  const platformSynergy: PlatformSynergy[] = Object.entries(platformCombos)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([combo, author_count]) => ({ combo, author_count }));

  // 3. 플랫폼별 장르 분포
  const platformGenreDist: Record<string, Record<string, number>> = {};
  for (const item of genrePlatformHeatmap) {
    if (!platformGenreDist[item.platform]) platformGenreDist[item.platform] = {};
    platformGenreDist[item.platform][item.genre] =
      (platformGenreDist[item.platform][item.genre] || 0) + item.count;
  }

  const platformDistributions: PlatformDistribution[] = [];
  for (const [plat, genreCounts] of Object.entries(platformGenreDist)) {
    const total = Object.values(genreCounts).reduce((s, v) => s + v, 0);
    const dist = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([genre, count]) => ({
        genre,
        count,
        ratio: round(total > 0 ? count / total : 0, 4),
      }));
    platformDistributions.push({ platform: plat, total, distribution: dist });
  }

  const hasData =
    genrePlatformHeatmap.length > 0 || Object.keys(authorPlatformMap).length > 0;

  if (!hasData) {
    return {
      error: '교차 분석을 위한 데이터가 부족합니다. 소설을 등록하거나 랭킹을 수집해주세요.',
      data: null,
    };
  }

  return {
    error: null,
    data: {
      genre_platform_heatmap: genrePlatformHeatmap,
      platform_synergy: platformSynergy,
      single_platform_authors: singlePlatform,
      multi_platform_authors: multiPlatform,
      platform_distributions: platformDistributions,
    },
  };
}

// ─── G. 전환 퍼널 (문피아 특화) ───

interface FunnelStage {
  stage: string;
  count: number;
}

interface ConversionPerformer {
  novel_id: number;
  title: string;
  total_days: number;
  initial_views: number;
  final_views: number;
  avg_daily_growth: number;
  avg_read_through: number;
  conversion_rate?: number;
  conversion_count?: number;
  conversion_date?: string;
  free_last_ep_view?: number;
  read_through_rate?: number;
  paid_first_day_subs?: number;
}

interface DistributionPercentile {
  percentile: number;
  value: number;
}

interface CorrelationResult {
  r: number;
  p_value: number;
  n: number;
  interpretation?: string;
}

interface ConversionFunnelData {
  platform: string;
  total_novels: number;
  converted_count: number;
  funnel_stages: FunnelStage[];
  conversion_distribution: DistributionPercentile[];
  readthrough_correlation: CorrelationResult;
  top_performers: ConversionPerformer[];
  non_converted: ConversionPerformer[];
  avg_read_through: number;
  avg_conversion_rate: number;
}

/**
 * detail_data JSON 안전 파싱
 */
function parseDetailData(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * 무료->유료 전환 시점 탐색 (conversion_funnel.py _find_conversion_point 포팅)
 */
function findConversionPoint(
  sortedRows: Array<{ date: string; views: number; detail_data: string }>,
): {
  conversion_rate: number;
  conversion_count: number;
  conversion_date: string;
  free_last_ep_view: number;
  read_through_rate: number;
  paid_first_day_subs: number;
} | null {
  if (sortedRows.length < 4) return null;

  for (let i = 1; i < sortedRows.length; i++) {
    const curr = sortedRows[i];
    const prev = sortedRows[i - 1];
    const currDD = parseDetailData(curr.detail_data);
    const prevDD = parseDetailData(prev.detail_data);

    // 유료 전환 감지
    const prevIsFree = !currDD.is_paid ? false : !prevDD.is_paid;
    const currIsPaid = !!currDD.is_paid;
    if (!(prevIsFree || !prevDD.is_paid) || !currIsPaid) {
      // prev가 무료이고 curr가 유료여야 함
      if (prevDD.is_paid || !currDD.is_paid) continue;
    }
    if (prevDD.is_paid) continue;
    if (!currDD.is_paid) continue;

    // 유료 둘째날 필요
    if (i + 1 >= sortedRows.length) continue;
    const paidSecondDay = sortedRows[i + 1];
    const paidSecondDD = parseDetailData(paidSecondDay.detail_data);
    if (!paidSecondDD.is_paid) continue;

    // 분자: 유료 첫날 구독수
    let paidFirstDaySubs = 0;
    const secondDaySubs = paidSecondDD.episode_subscriptions;
    if (Array.isArray(secondDaySubs) && secondDaySubs.length >= 2) {
      paidFirstDaySubs = Number(secondDaySubs[1]) || 0;
    }
    if (paidFirstDaySubs <= 0) {
      const firstDaySubs = currDD.episode_subscriptions;
      if (Array.isArray(firstDaySubs) && firstDaySubs.length > 0) {
        paidFirstDaySubs = Math.max(...firstDaySubs.map(Number).filter((n) => !isNaN(n)));
      }
    }
    if (paidFirstDaySubs <= 0) continue;

    // 분모: 무료 마지막-1일 조회수
    if (i < 2) continue;
    const freePrevDay = sortedRows[i - 2];
    const freePrevDD = parseDetailData(freePrevDay.detail_data);

    let freeLatestEpView = 0;
    const freePrevEpViews = freePrevDD.episode_views;
    if (Array.isArray(freePrevEpViews) && freePrevEpViews.length > 0) {
      freeLatestEpView = Number(freePrevEpViews[0]) || 0;
    }
    if (freeLatestEpView <= 0) {
      freeLatestEpView = Number(freePrevDay.views) || 0;
    }
    if (freeLatestEpView <= 0) continue;

    // 연독률
    const readThroughRate = Number(prevDD.avg_read_through_rate);
    if (!readThroughRate || readThroughRate <= 0) continue;

    // 전환률
    const estimatedFreeReaders = freeLatestEpView * (readThroughRate / 100);
    const conversionRate = (paidFirstDaySubs / estimatedFreeReaders) * 100;

    return {
      conversion_rate: round(conversionRate, 1),
      conversion_count: paidFirstDaySubs,
      conversion_date: paidSecondDay.date,
      free_last_ep_view: round(freeLatestEpView, 2),
      read_through_rate: round(readThroughRate, 2),
      paid_first_day_subs: paidFirstDaySubs,
    };
  }

  return null;
}

/**
 * 전환율 퍼널 분석 (문피아 특화, 다른 플랫폼은 기본 퍼널)
 */
export function analyzeConversionFunnel(db: Database): AnalysisResult<ConversionFunnelData> {
  const rows = getMunpiaDetailData(db);

  if (rows.length === 0) {
    // 문피아 데이터 없으면 기본 퍼널
    return analyzeGenericFunnel(db);
  }

  // 소설별 데이터 정리
  const novelData: Record<
    number,
    {
      title: string;
      rows: Array<{ date: string; views: number; detail_data: string }>;
    }
  > = {};

  for (const r of rows) {
    if (!novelData[r.novel_id]) {
      novelData[r.novel_id] = { title: r.title, rows: [] };
    }
    novelData[r.novel_id].title = r.title;
    novelData[r.novel_id].rows.push({
      date: r.date,
      views: Number(r.views) || 0,
      detail_data: r.detail_data,
    });
  }

  const conversions: ConversionPerformer[] = [];
  const allNovelStats: ConversionPerformer[] = [];
  const readThroughRates: number[] = [];

  for (const [novelIdStr, info] of Object.entries(novelData)) {
    const novelId = Number(novelIdStr);
    const sortedRows = info.rows.sort((a, b) => a.date.localeCompare(b.date));
    if (sortedRows.length < 3) continue;

    // 연독률 수집
    const novelRts: number[] = [];
    for (const row of sortedRows) {
      const dd = parseDetailData(row.detail_data);
      const rt = Number(dd.avg_read_through_rate);
      if (rt > 0) {
        novelRts.push(rt);
        readThroughRates.push(rt);
      }
    }
    const avgRt = novelRts.length > 0 ? round(mean(novelRts), 2) : 0;

    // 조회수 성장률
    const deltas: number[] = [];
    for (let j = 1; j < sortedRows.length; j++) {
      deltas.push(sortedRows[j].views - sortedRows[j - 1].views);
    }
    const avgDelta = deltas.length > 0 ? mean(deltas) : 0;

    const novelStat: ConversionPerformer = {
      novel_id: novelId,
      title: info.title,
      total_days: sortedRows.length,
      initial_views: round(sortedRows[0].views, 2),
      final_views: round(sortedRows[sortedRows.length - 1].views, 2),
      avg_daily_growth: round(avgDelta, 2),
      avg_read_through: avgRt,
    };
    allNovelStats.push(novelStat);

    // 전환점 탐색
    const conv = findConversionPoint(sortedRows);
    if (conv) {
      conversions.push({
        ...novelStat,
        conversion_rate: conv.conversion_rate,
        conversion_count: conv.conversion_count,
        conversion_date: conv.conversion_date,
        free_last_ep_view: conv.free_last_ep_view,
        read_through_rate: conv.read_through_rate,
        paid_first_day_subs: conv.paid_first_day_subs,
      });
    }
  }

  // 전환률 분포
  const conversionRates = conversions
    .map((c) => c.conversion_rate!)
    .filter((r) => r > 0)
    .sort((a, b) => a - b);

  const conversionDistribution: DistributionPercentile[] = [];
  if (conversionRates.length > 0) {
    for (const p of [10, 25, 50, 75, 90]) {
      conversionDistribution.push({
        percentile: p,
        value: round(percentile(conversionRates, p), 2),
      });
    }
  }

  // 연독률 x 전환률 상관관계 (간이 Pearson — scipy 없음)
  const corrData = conversions
    .filter((c) => (c.read_through_rate ?? 0) > 0 && (c.conversion_rate ?? 0) > 0)
    .map((c) => [c.read_through_rate!, c.conversion_rate!] as [number, number]);

  let readthroughCorrelation: CorrelationResult = { r: 0, p_value: 1, n: 0 };
  if (corrData.length >= 5) {
    const xs = corrData.map(([x]) => x);
    const ys = corrData.map(([, y]) => y);
    const r = pearsonR(xs, ys);
    readthroughCorrelation = {
      r: round(r, 4),
      p_value: 0, // p-value 계산은 scipy 전용 — 웹에서는 0으로
      n: corrData.length,
      interpretation:
        r > 0.7
          ? '강한 양의 상관'
          : r > 0.3
            ? '중간 양의 상관'
            : r > 0
              ? '약한 양의 상관'
              : '음의 상관',
    };
  }

  // 정렬
  const sortedConversions = [...conversions].sort(
    (a, b) => (b.conversion_rate ?? 0) - (a.conversion_rate ?? 0),
  );
  const convertedIds = new Set(conversions.map((c) => c.novel_id));
  const nonConverted = allNovelStats
    .filter((s) => !convertedIds.has(s.novel_id))
    .sort((a, b) => b.avg_daily_growth - a.avg_daily_growth);

  return {
    error: null,
    data: {
      platform: '문피아',
      total_novels: allNovelStats.length,
      converted_count: conversions.length,
      funnel_stages: [
        { stage: '전체 분석 대상', count: allNovelStats.length },
        { stage: '유료 전환 감지', count: conversions.length },
        { stage: '전환률 > 0', count: conversionRates.length },
        { stage: '상관 분석 대상', count: corrData.length },
      ],
      conversion_distribution: conversionDistribution,
      readthrough_correlation: readthroughCorrelation,
      top_performers: sortedConversions.slice(0, 10),
      non_converted: nonConverted.slice(0, 10),
      avg_read_through:
        readThroughRates.length > 0 ? round(mean(readThroughRates), 2) : 0,
      avg_conversion_rate: conversionRates.length > 0 ? round(mean(conversionRates), 1) : 0,
    },
  };
}

/**
 * 간이 Pearson 상관계수 (scipy 없이)
 */
function pearsonR(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : num / den;
}

/**
 * 문피아 외 플랫폼 기본 퍼널 (플랫폼별 소설수 + 평균 조회수)
 */
function analyzeGenericFunnel(db: Database): AnalysisResult<ConversionFunnelData> {
  // ManagementNovel + DailyStatistics join으로 플랫폼별 요약
  const allNovels = getTitlesByPlatform(db);
  const platformCounts: Record<string, number> = {};
  for (const { platform } of allNovels) {
    const p = platform || '미분류';
    platformCounts[p] = (platformCounts[p] || 0) + 1;
  }

  const stages: FunnelStage[] = Object.entries(platformCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([stage, count]) => ({ stage, count }));

  return {
    error: null,
    data: {
      platform: '전체',
      total_novels: allNovels.length,
      converted_count: 0,
      funnel_stages: stages,
      conversion_distribution: [],
      readthrough_correlation: { r: 0, p_value: 1, n: 0 },
      top_performers: [],
      non_converted: [],
      avg_read_through: 0,
      avg_conversion_rate: 0,
    },
  };
}
