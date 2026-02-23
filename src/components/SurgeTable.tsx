/**
 * Surge 급상승 테이블
 */
import type { SurgeItem } from '../db/types';
import PlatformBadge from './PlatformBadge';

interface Props {
  items: SurgeItem[];
  title: string;
  limit?: number;
}

function formatViews(v: number): string {
  if (v >= 10000) return `${(v / 10000).toFixed(1)}만`;
  return v.toLocaleString();
}

export default function SurgeTable({ items, title, limit = 20 }: Props) {
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
              <th className="text-right py-1.5 px-2 text-slate-500">상승폭</th>
              <th className="text-right py-1.5 px-2 text-slate-500">상승률</th>
            </tr>
          </thead>
          <tbody>
            {display.map((item, i) => (
              <tr
                key={`${item.novel_id}-${i}`}
                className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <td className="py-1.5 px-2 text-slate-400">{i + 1}</td>
                <td className="py-1.5 px-2 font-medium text-slate-800 dark:text-slate-200 max-w-[180px] truncate">
                  {item.title}
                </td>
                <td className="py-1.5 px-2">
                  <PlatformBadge platform={item.platform} />
                </td>
                <td className="py-1.5 px-2 text-right text-green-600 dark:text-green-400 font-medium">
                  +{formatViews(item.surge)}
                </td>
                <td className="py-1.5 px-2 text-right text-blue-600 dark:text-blue-400">
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
