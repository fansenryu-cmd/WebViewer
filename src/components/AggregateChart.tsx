/**
 * 통합 통계 차트 (퍼센타일 + 내 작품)
 */
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { PlatformAggregate } from '../db/types';

interface Props {
  data: PlatformAggregate;
  platform: string;
  color: string;
}

function formatViews(v: number): string {
  if (v >= 10000) return `${(v / 10000).toFixed(1)}만`;
  return v.toLocaleString();
}

export default function AggregateChart({ data, platform, color }: Props) {
  // 모든 시리즈를 같은 X축에 매핑
  const maxLen = Math.max(
    data.top20.length,
    data.top40?.length ?? 0,
    data.top60?.length ?? 0,
    data.top80?.length ?? 0,
    data.myNovel?.length ?? 0,
  );

  const chartData = [];
  for (let i = 0; i < maxLen; i++) {
    chartData.push({
      day: i,
      top20: data.top20[i]?.cumulativeViews ?? null,
      top40: data.top40?.[i]?.cumulativeViews ?? null,
      top60: data.top60?.[i]?.cumulativeViews ?? null,
      top80: data.top80?.[i]?.cumulativeViews ?? null,
      myNovel: data.myNovel?.[i]?.cumulativeViews ?? null,
    });
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-2">
        <span
          className="w-3 h-3 rounded-full inline-block"
          style={{ backgroundColor: color }}
        />
        {platform}
        <span className="text-xs text-slate-400 font-normal">
          ({data.totalNovels}개 작품)
        </span>
        {data.percentileTop !== undefined && (
          <span className="text-xs text-blue-500 font-normal">
            상위 {data.percentileTop}%
          </span>
        )}
      </h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 10 }}
            label={{ value: '경과일', position: 'insideBottom', offset: -2, fontSize: 10 }}
          />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={formatViews} />
          <Tooltip
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={((v: any, n: any) => {
              const labels: Record<string, string> = {
                top20: '상위 20%',
                top40: '상위 40%',
                top60: '상위 60%',
                top80: '상위 80%',
                myNovel: '내 작품',
              };
              return [formatViews(Number(v ?? 0)), labels[n] || n];
            }) as any}
            contentStyle={{
              backgroundColor: 'rgba(255,255,255,0.95)',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Legend
            formatter={(value) => {
              const labels: Record<string, string> = {
                top20: '상위 20%',
                top40: '상위 40%',
                top60: '상위 60%',
                top80: '상위 80%',
                myNovel: '내 작품',
              };
              return labels[value] || value;
            }}
            wrapperStyle={{ fontSize: 11 }}
          />
          <Line type="monotone" dataKey="top20" stroke="#ef4444" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="top40" stroke="#f97316" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
          <Line type="monotone" dataKey="top60" stroke="#eab308" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
          <Line type="monotone" dataKey="top80" stroke="#a3a3a3" strokeWidth={1} dot={false} strokeDasharray="6 3" />
          {data.myNovel && (
            <Line
              type="monotone"
              dataKey="myNovel"
              stroke={color}
              strokeWidth={2.5}
              dot={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
