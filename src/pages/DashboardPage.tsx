/**
 * 대시보드 — 소설 목록 + 요약 카드
 */
import { useMemo } from 'react';
import { useDb } from '../hooks/useDb';
import { getAllNovels, getStatsByNovelId, getLatestRankingDate, getRecentRankingDates } from '../db/queries';
import { normalizePlatform, PLATFORM_COLORS } from '../utils/platform';
import PlatformBadge from '../components/PlatformBadge';

function formatViews(v: number): string {
  if (v >= 100000000) return `${(v / 100000000).toFixed(1)}억`;
  if (v >= 10000) return `${(v / 10000).toFixed(1)}만`;
  return v.toLocaleString();
}

export default function DashboardPage() {
  const { db } = useDb();

  const data = useMemo(() => {
    if (!db) return null;
    const novels = getAllNovels(db);
    const latestDate = getLatestRankingDate(db);
    const dates = getRecentRankingDates(db, 5);

    // 플랫폼별 통계
    const platformStats = new Map<string, { count: number; totalViews: number }>();
    let totalViews = 0;

    const novelSummaries = novels.map((n) => {
      const stats = getStatsByNovelId(db, n.id);
      const latest = stats.length > 0 ? stats[stats.length - 1] : null;
      const views = latest?.views ?? 0;
      const platform = normalizePlatform(n.platform);

      totalViews += views;
      const ps = platformStats.get(platform) ?? { count: 0, totalViews: 0 };
      ps.count++;
      ps.totalViews += views;
      platformStats.set(platform, ps);

      // 일일 증가분
      let delta = 0;
      if (stats.length >= 2) {
        delta = stats[stats.length - 1].views - stats[stats.length - 2].views;
      }

      return { ...n, views, delta, latestDate: latest?.date ?? null, platform };
    });

    return { novels: novelSummaries, latestDate, dates, platformStats, totalViews };
  }, [db]);

  if (!db || !data) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        DB를 먼저 로드해주세요
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* 요약 카드 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
          <p className="text-xs text-slate-500 dark:text-slate-400">총 작품</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{data.novels.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
          <p className="text-xs text-slate-500 dark:text-slate-400">총 조회수</p>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{formatViews(data.totalViews)}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
          <p className="text-xs text-slate-500 dark:text-slate-400">최근 랭킹</p>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{data.latestDate || '-'}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
          <p className="text-xs text-slate-500 dark:text-slate-400">플랫폼</p>
          <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{data.platformStats.size}</p>
        </div>
      </div>

      {/* 플랫폼 분포 */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">플랫폼별 분포</h2>
        <div className="space-y-2">
          {Array.from(data.platformStats).map(([platform, stat]) => {
            const color = PLATFORM_COLORS[platform] || '#9ca3af';
            const pct = data.totalViews > 0 ? (stat.totalViews / data.totalViews) * 100 : 0;
            return (
              <div key={platform} className="flex items-center gap-2">
                <span className="w-16 text-xs text-slate-600 dark:text-slate-400">{platform}</span>
                <div className="flex-1 h-4 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: color }}
                  />
                </div>
                <span className="text-xs text-slate-500 w-16 text-right">{stat.count}개</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 소설 목록 */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 p-3 border-b border-slate-200 dark:border-slate-700">
          등록 작품 ({data.novels.length})
        </h2>
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {data.novels.map((n) => (
            <div key={n.id} className="p-3 flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{n.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <PlatformBadge platform={n.platform} />
                  <span className="text-xs text-slate-400">{n.author || '미상'}</span>
                </div>
              </div>
              <div className="text-right ml-3 shrink-0">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  {formatViews(n.views)}
                </p>
                {n.delta > 0 && (
                  <p className="text-xs text-green-500">+{formatViews(n.delta)}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
