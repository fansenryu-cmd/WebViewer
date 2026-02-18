/**
 * 홈페이지 — 플랫폼별 소설 목록 (풍부한 통계 포함)
 * - 최신 조회수, 전날 대비 증감, 연독률 표시
 */
import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useDb } from '../context/DbContext';
import { getNovelsByPlatform, getLatestStats } from '../db/queries';
import type { ManagementNovel, DailyStatistics } from '../db/types';

const PLATFORM_COLORS: Record<string, string> = {
  '네이버시리즈': 'border-green-400 bg-green-50',
  '카카오페이지': 'border-yellow-400 bg-yellow-50',
  '문피아': 'border-blue-400 bg-blue-50',
  '리디': 'border-purple-400 bg-purple-50',
  '리디북스': 'border-purple-400 bg-purple-50',
  '노벨피아': 'border-orange-400 bg-orange-50',
};

/** 조회수를 한국식 만/억 단위로 표시 */
function formatViews(views: number | null | undefined): string {
  if (views == null) return '-';
  if (views >= 100_000_000) return `${(views / 100_000_000).toFixed(1)}억`;
  if (views >= 10_000) return `${(views / 10_000).toFixed(1)}만`;
  return views.toLocaleString();
}

/** 연독률 파싱 */
function parseReadThroughRate(detailData: string | null): number | null {
  if (!detailData) return null;
  try {
    const dd = JSON.parse(detailData);
    return dd?.avg_read_through_rate ?? null;
  } catch {
    return null;
  }
}

interface NovelWithStats extends ManagementNovel {
  latestViews: number | null;
  prevViews: number | null;
  latestDate: string | null;
  readThroughRate: number | null;
}

export function HomePage() {
  const { db } = useDb();

  const data = useMemo(() => {
    if (!db) return null;
    const byPlatform = getNovelsByPlatform(db);
    const result: Record<string, NovelWithStats[]> = {};

    for (const [platform, novels] of Object.entries(byPlatform)) {
      if (novels.length === 0) continue;
      result[platform] = novels.map((n) => {
        const stats = getLatestStats(db, n.id, 2);
        const latest = stats[0] as DailyStatistics | undefined;
        const prev = stats[1] as DailyStatistics | undefined;
        return {
          ...n,
          latestViews: latest?.views ?? null,
          prevViews: prev?.views ?? null,
          latestDate: latest?.date ?? null,
          readThroughRate: parseReadThroughRate(latest?.detail_data ?? null),
        };
      });
    }
    return result;
  }, [db]);

  if (!data) return null;

  const platforms = Object.keys(data).filter((p) => data[p].length > 0);

  return (
    <div className="max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">📚 플랫폼별 소설 목록</h1>
      {platforms.map((platform) => {
        const novels = data[platform];
        const totalViews = novels.reduce((sum, n) => sum + (n.latestViews ?? 0), 0);
        const borderClass = PLATFORM_COLORS[platform] || 'border-gray-300 bg-gray-50';

        return (
          <section key={platform} className="mb-8">
            <div className={`border-l-4 ${borderClass} rounded-lg p-3 mb-3`}>
              <h2 className="text-lg font-semibold text-gray-800">
                {platform}
                <span className="ml-2 text-sm font-normal text-gray-500">
                  {novels.length}개
                </span>
                {totalViews > 0 && (
                  <span className="ml-2 text-sm font-normal text-gray-400">
                    총 {formatViews(totalViews)}
                  </span>
                )}
              </h2>
            </div>
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 bg-gray-50 border-b">
                    <th className="text-left px-4 py-2">소설</th>
                    <th className="text-right px-3 py-2">조회수</th>
                    <th className="text-right px-3 py-2 hidden sm:table-cell">증감</th>
                    <th className="text-right px-3 py-2 hidden md:table-cell">연독률</th>
                    <th className="text-right px-3 py-2 hidden lg:table-cell">최근 날짜</th>
                  </tr>
                </thead>
                <tbody>
                  {novels.map((n) => {
                    const delta = (n.latestViews != null && n.prevViews != null) ? n.latestViews - n.prevViews : null;
                    const deltaRate = (delta != null && n.prevViews && n.prevViews > 0) ? ((delta / n.prevViews) * 100) : null;
                    return (
                      <tr key={n.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2">
                          <Link to={`/novel/${n.id}`} className="font-medium text-gray-900 hover:text-blue-600 block truncate max-w-[250px]">
                            {n.title}
                          </Link>
                          {n.author && (
                            <span className="text-xs text-gray-500">{n.author}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-800 whitespace-nowrap">
                          {formatViews(n.latestViews)}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap hidden sm:table-cell">
                          {delta != null && delta !== 0 ? (
                            delta > 0 ? (
                              <span className="text-red-500 text-xs font-medium">▲{formatViews(delta)}
                                {deltaRate != null && <span className="text-gray-400 ml-0.5">(+{deltaRate.toFixed(1)}%)</span>}
                              </span>
                            ) : (
                              <span className="text-blue-500 text-xs font-medium">▼{formatViews(Math.abs(delta))}
                                {deltaRate != null && <span className="text-gray-400 ml-0.5">({deltaRate.toFixed(1)}%)</span>}
                              </span>
                            )
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap hidden md:table-cell">
                          {n.readThroughRate != null ? (
                            <span className="text-indigo-600 text-xs font-medium">{n.readThroughRate.toFixed(1)}%</span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-400 text-xs hidden lg:table-cell">
                          {n.latestDate || '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
