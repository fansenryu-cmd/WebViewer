/**
 * 제목 패턴 분석 서비스 (backend/routers/wnpsa_integration.py 포팅)
 * 규칙 기반 키워드 추출 — 서버 불필요, 브라우저에서 직접 실행
 */
import type { Database } from 'sql.js';
import type { TitlePatternResult, PatternItem, KeywordFreqRow, GenreGrowthItem } from '../db/types';
import { getRecentRankingTitles, getNovelCountByGenrePeriod } from '../db/queries';

// ── 패턴 사전 (backend _extract_title_patterns_rule_based 동기화) ──

const MODIFIER_PATTERNS = [
  '회귀한', '회귀', '빙의한', '빙의', '환생한', '환생',
  '각성한', '각성', '먼치킨', '최강의', '무적의', 'SSS급',
  'SS급', 'S급', 'A급', '전지적', '절대적', '초월한', '초월',
  '불멸의', '무한', '만렙', '레벨업', '랭커', '천재',
  '역대급', '전설의', '최고의', '유일한', '버린',
  '숨겨진', '잃어버린', '되돌아온', '살아남은', '깨어난',
  '선택받은', '추방된', '버려진', '소환된', '전이된',
  '포기한', '망한', '실패한', '다시', '두번째',
  '세번째', '미래의', '과거의', '평범한', '평균',
];

const JOB_PATTERNS = [
  '감독', '플레이어', '기사', '마법사', '헌터', 'CEO',
  '사장', '회장', '공작', '왕자', '황제', '여왕', '공주',
  '용사', '마왕', '성녀', '성기사', '검사', '궁수',
  '연금술사', '넥서스', '프로듀서', '작가', '교수',
  '학생', '의사', '변호사', '탐정', '요리사', '제왕',
  '튜터', '아이돌', '히어로', '재벌', '백수', '노비',
  '조련사', '테이머', '소환사', '치유사', '무당',
];

const ACTION_PATTERNS = [
  '데뷔', '키우기', '생존', '복수', '사업', '경영',
  '레이드', '던전', '사냥', '탐험', '정복', '지배',
  '성장', '수련', '수행', '공략', '전쟁', '결투',
  '요리', '연애', '계약', '결혼', '이혼', '도망',
  '탈출', '귀환', '전생', '환생기', '육성',
];

/** 제목에서 패턴 추출 (규칙 기반) */
export function extractTitlePatterns(titles: string[]): TitlePatternResult {
  const modCount = new Map<string, number>();
  const jobCount = new Map<string, number>();
  const actCount = new Map<string, number>();
  const otherCount = new Map<string, number>();

  const allPatterns = new Set([...MODIFIER_PATTERNS, ...JOB_PATTERNS, ...ACTION_PATTERNS]);

  // 단어 추출용 정규식
  const wordRe = /[가-힣a-zA-Z]{2,}/g;

  for (const title of titles) {
    if (!title) continue;

    // 패턴 매칭
    for (const mod of MODIFIER_PATTERNS) {
      if (title.includes(mod)) modCount.set(mod, (modCount.get(mod) ?? 0) + 1);
    }
    for (const job of JOB_PATTERNS) {
      if (title.includes(job)) jobCount.set(job, (jobCount.get(job) ?? 0) + 1);
    }
    for (const act of ACTION_PATTERNS) {
      if (title.includes(act)) actCount.set(act, (actCount.get(act) ?? 0) + 1);
    }

    // 기타 키워드 (패턴에 없는 2글자 이상 단어)
    const words = title.match(wordRe) || [];
    const seen = new Set<string>();
    for (const w of words) {
      if (!allPatterns.has(w) && !seen.has(w)) {
        seen.add(w);
        otherCount.set(w, (otherCount.get(w) ?? 0) + 1);
      }
    }
  }

  const toSorted = (m: Map<string, number>, limit = 30): PatternItem[] =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([keyword, count]) => ({ keyword, count }));

  return {
    modifiers: toSorted(modCount),
    jobs: toSorted(jobCount),
    actions: toSorted(actCount),
    other_keywords: toSorted(otherCount),
  };
}

/** 키워드 빈도 (플랫폼별) */
export function getKeywordFrequency(
  db: Database,
  days = 60,
  limit = 30,
): KeywordFreqRow[] {
  const rows = getRecentRankingTitles(db, days);
  const wordRe = /[가-힣a-zA-Z]{2,}/g;
  const kwPlatform = new Map<string, Map<string, number>>();
  const kwTotal = new Map<string, number>();

  for (const r of rows) {
    if (!r.title) continue;
    const words = r.title.match(wordRe) || [];
    const seen = new Set<string>();
    for (const w of words) {
      if (seen.has(w)) continue;
      seen.add(w);
      kwTotal.set(w, (kwTotal.get(w) ?? 0) + 1);
      if (!kwPlatform.has(w)) kwPlatform.set(w, new Map());
      const pm = kwPlatform.get(w)!;
      const p = r.platform || '기타';
      pm.set(p, (pm.get(p) ?? 0) + 1);
    }
  }

  return [...kwTotal.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([keyword, total]) => ({
      keyword,
      platforms: Object.fromEntries(kwPlatform.get(keyword) || []),
      total,
    }));
}

/** 장르 성장률 (최근 1주 vs 이전 1주) */
export function getGenreGrowth(db: Database): GenreGrowthItem[] {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  // 이번 주 월요일
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - diffToMonday);
  const thisMondayStr = thisMonday.toISOString().slice(0, 10);
  const todayStr = now.toISOString().slice(0, 10);

  // 지난 주 월요일 ~ 일요일
  const prevMonday = new Date(thisMonday);
  prevMonday.setDate(thisMonday.getDate() - 7);
  const prevSunday = new Date(thisMonday);
  prevSunday.setDate(thisMonday.getDate() - 1);
  const prevMondayStr = prevMonday.toISOString().slice(0, 10);
  const prevSundayStr = prevSunday.toISOString().slice(0, 10);

  const thisWeek = getNovelCountByGenrePeriod(db, thisMondayStr, todayStr);
  const prevWeek = getNovelCountByGenrePeriod(db, prevMondayStr, prevSundayStr);

  const prevMap = new Map(prevWeek.map((r) => [r.genre, r.cnt]));
  const result: GenreGrowthItem[] = [];

  for (const r of thisWeek) {
    const prev = prevMap.get(r.genre) || 0;
    const rate = prev > 0 ? ((r.cnt - prev) / prev) * 100 : r.cnt > 0 ? 100 : 0;
    result.push({
      genre: r.genre,
      prev_count: prev,
      this_count: r.cnt,
      growth_rate: Math.round(rate * 10) / 10,
    });
  }

  // 지난 주에만 있었던 장르 (이번 주 0)
  for (const [genre, cnt] of prevMap) {
    if (!result.find((r) => r.genre === genre)) {
      result.push({ genre, prev_count: cnt, this_count: 0, growth_rate: -100 });
    }
  }

  result.sort((a, b) => b.growth_rate - a.growth_rate);
  return result;
}

/** 전체 분석 결과 (TitlePatternPage용) */
export function getFullTitleAnalysis(db: Database, days = 60) {
  const rows = getRecentRankingTitles(db, days);
  const titles = rows.map((r) => r.title);
  const patterns = extractTitlePatterns(titles);
  const keywordFreq = getKeywordFrequency(db, days);
  const genreGrowth = getGenreGrowth(db);

  return { patterns, keywordFreq, genreGrowth, totalTitles: titles.length };
}
