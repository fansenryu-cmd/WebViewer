/**
 * 개별 소설 조회수 차트 (누적 + 일일 증가분)
 */
import {
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { DailyStatistics } from '../db/types';

interface Props {
  stats: DailyStatistics[];
  title: string;
}

function formatViews(v: number): string {
  if (v >= 10000) return `${(v / 10000).toFixed(1)}만`;
  return v.toLocaleString();
}

export default function StatsChart({ stats, title }: Props) {
  if (stats.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-6">통계 데이터가 없습니다</p>;
  }

  const data = stats.map((s, i) => ({
    date: s.date.slice(5), // MM-DD
    views: s.views,
    delta: i > 0 ? Math.max(0, s.views - stats[i - 1].views) : 0,
  }));

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">{title}</h3>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 10 }}
            tickFormatter={formatViews}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 10 }}
            tickFormatter={formatViews}
          />
          <Tooltip
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={((v: any, n: any) => [
              formatViews(Number(v ?? 0)),
              n === 'views' ? '누적 조회수' : '일일 증가분',
            ]) as any}
            contentStyle={{
              backgroundColor: 'rgba(255,255,255,0.95)',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Legend
            formatter={(value) =>
              value === 'views' ? '누적 조회수' : '일일 증가분'
            }
            wrapperStyle={{ fontSize: 11 }}
          />
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="views"
            fill="rgba(59,130,246,0.15)"
            stroke="#3b82f6"
            strokeWidth={2}
          />
          <Bar
            yAxisId="right"
            dataKey="delta"
            fill="rgba(34,197,94,0.6)"
            radius={[2, 2, 0, 0]}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
