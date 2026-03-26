/**
 * 트렌드 인포그래픽 페이지
 * - 플랫폼별 키워드 워드클라우드
 * - 급상승 트렌드 (오늘/이번주/이번달)
 * - 장르 분포 (가로 막대 차트)
 */
import { useMemo, useState } from 'react';
import { useDb } from '../hooks/useDb';
import { buildInfographicData } from '../services/infographicService';
import { normalizePlatform, PLATFORM_COLORS } from '../utils/platform';
import { formatViews } from '../utils/format';
import PlatformBadge from '../components/PlatformBadge';
import WordCloud from '../components/WordCloud';

const PLATFORM_DISPLAY: Record<string, string> = {
  '네이버시리즈': '네이버',
  '카카오페이지': '카카오',
  '문피아': '문피아',
  '리디': '리디',
  '노벨피아': '노벨피아',
};

function getPlatformHex(platform: string): string {
  const normalized = PLATFORM_DISPLAY[platform]
    ? normalizePlatform(PLATFORM_DISPLAY[platform])
    : normalizePlatform(platform);
  return PLATFORM_COLORS[normalized] || '#9ca3af';
}

export default function TrendInfographicPage() {
  const { db } = useDb();
  const [days, setDays] = useState(30);

  const data = useMemo(() => {
    if (!db) return null;
    return buildInfographicData(db, days);
  }, [db, days]);

  if (!db) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 dark:text-slate-500">
        DB를 먼저 로드해주세요
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 space-y-3">
        <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">
          트렌드 인포그래픽
        </h1>
        <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-6 text-center text-slate-600 dark:text-slate-400 text-sm">
          데이터를 불러오는 중...
        </div>
      </div>
    );
  }

  const hasKeywords = data.byPlatform.some((p) => p.keywords.length > 0);

  // 장르 전체 합산 (가로 막대 차트용)
  const allGenres = useMemo(() => {
    const genreMap = new Map<string, number>();
    for (const p of data.byPlatform) {
      for (const g of p.genres) {
        genreMap.set(g.text, (genreMap.get(g.text) ?? 0) + g.count);
      }
    }
    return [...genreMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([genre, count]) => ({ genre, count }));
  }, [data]);

  const maxGenreCount = Math.max(...allGenres.map((g) => g.count), 1);

  return (
    <div className="p-4 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">
          트렌드 인포그래픽
        </h1>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {data.snapshotDate} 기준 · 최근 {days}일
        </span>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="ml-auto px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-xs text-slate-800 dark:text-slate-200"
        >
          <option value={30}>30일</option>
          <option value={60}>60일</option>
          <option value={90}>90일</option>
        </select>
      </div>

      {/* ── 플랫폼별 키워드 워드클라우드 ── */}
      {hasKeywords && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            플랫폼별 키워드 분포
          </h2>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {data.byPlatform.map((p) => {
              const color = getPlatformHex(p.platform);
              return (
                <div
                  key={p.platform}
                  className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {p.platform}
                    </h3>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-auto">
                      {p.keywords.length}개 키워드
                    </span>
                  </div>
                  <WordCloud
                    items={p.keywords.map((k) => ({ ...k, type: 'keyword' as const }))}
                    maxItems={20}
                    platformColor={color}
                  />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── 급상승 트렌드 ── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          급상승 트렌드
        </h2>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
          <RisingColumn title="오늘 급상승" items={data.todayRising} />
          <RisingColumn title="이번주 급상승" items={data.weekRising} />
          <RisingColumn title="이번달 급상승" items={data.monthRising} />
        </div>
      </section>

      {/* ── 장르 분포 (가로 막대 차트) ── */}
      {allGenres.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            장르 분포
          </h2>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700 space-y-1.5">
            {allGenres.map((g) => (
              <div key={g.genre} className="flex items-center gap-2 text-xs">
                <span
                  className="w-24 text-slate-700 dark:text-slate-300 truncate font-medium text-right"
                  title={g.genre}
                >
                  {g.genre}
                </span>
                <div className="flex-1 h-5 bg-slate-100 dark:bg-slate-700 rounded-sm overflow-hidden">
                  <div
                    className="h-full bg-indigo-500/70 dark:bg-indigo-400/60 rounded-sm transition-all"
                    style={{ width: `${(g.count / maxGenreCount) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right font-mono text-slate-500 dark:text-slate-400">
                  {g.count}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ── 급상승 컬럼 서브 컴포넌트 ── */
function RisingColumn({
  title,
  items,
}: {
  title: string;
  items: Array<{ title: string; platform: string; surge: number }>;
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
      <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-4">
          데이터 없음
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.slice(0, 10).map((item, i) => (
            <li key={`${item.title}-${i}`} className="flex items-start gap-1.5 text-xs">
              <span className="text-slate-400 dark:text-slate-500 w-4 shrink-0 text-right">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <span
                  className="text-slate-800 dark:text-slate-200 block truncate"
                  title={item.title}
                >
                  {item.title}
                </span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <PlatformBadge platform={item.platform} />
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium whitespace-nowrap">
                    +{formatViews(item.surge)}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
