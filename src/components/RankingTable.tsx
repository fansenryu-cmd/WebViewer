/**
 * 랭킹 테이블
 */
import type { DailyRanking } from '../db/types';

interface Props {
  rankings: DailyRanking[];
  platform: string;
  myNovelIds: number[];
}

function formatViews(v: number | null): string {
  if (v === null || v === undefined) return '-';
  if (v >= 10000) return `${(v / 10000).toFixed(1)}만`;
  return v.toLocaleString();
}

export default function RankingTable({ rankings, platform, myNovelIds }: Props) {
  if (rankings.length === 0) return null;

  return (
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
        {platform}
        <span className="text-xs text-slate-400 font-normal">({rankings.length}개)</span>
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              <th className="text-center py-1.5 px-1 text-slate-500 w-8">순위</th>
              <th className="text-left py-1.5 px-2 text-slate-500">제목</th>
              <th className="text-left py-1.5 px-2 text-slate-500">작가</th>
              <th className="text-right py-1.5 px-2 text-slate-500">조회수</th>
            </tr>
          </thead>
          <tbody>
            {rankings.map((r) => {
              const isMine = r.novel_id !== null && myNovelIds.includes(r.novel_id);
              return (
                <tr
                  key={r.id}
                  className={`border-b border-slate-100 dark:border-slate-800 ${
                    isMine
                      ? 'bg-blue-50 dark:bg-blue-900/30 font-semibold'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <td className="py-1.5 px-1 text-center text-slate-500">{r.rank}</td>
                  <td className="py-1.5 px-2 text-slate-800 dark:text-slate-200 max-w-[160px] truncate">
                    {isMine && <span className="text-blue-500 mr-1">★</span>}
                    {r.title}
                  </td>
                  <td className="py-1.5 px-2 text-slate-500 dark:text-slate-400 max-w-[80px] truncate">
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
  );
}
