/**
 * 통계 — 개별 작품 + 통합 통계
 */
import { useState, useMemo } from 'react';
import { useDb } from '../hooks/useDb';
import { getAllNovels, getStatsByNovelId } from '../db/queries';
import { getAggregateStats } from '../services/aggregateService';
import { PLATFORM_COLORS } from '../utils/platform';
import NovelSelector from '../components/NovelSelector';
import StatsChart from '../components/StatsChart';
import AggregateChart from '../components/AggregateChart';

type Tab = 'individual' | 'aggregate';

export default function StatsPage() {
  const { db } = useDb();
  const [tab, setTab] = useState<Tab>('individual');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const novels = useMemo(() => {
    if (!db) return [];
    return getAllNovels(db);
  }, [db]);

  const stats = useMemo(() => {
    if (!db || !selectedId) return [];
    return getStatsByNovelId(db, selectedId);
  }, [db, selectedId]);

  const selectedNovel = useMemo(
    () => novels.find((n) => n.id === selectedId) ?? null,
    [novels, selectedId],
  );

  const aggregate = useMemo(() => {
    if (!db) return null;
    return getAggregateStats(db, selectedId ?? undefined);
  }, [db, selectedId]);

  if (!db) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        DB를 먼저 로드해주세요
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {/* 소설 선택 */}
      <NovelSelector
        novels={novels}
        value={selectedId}
        onChange={setSelectedId}
        label="작품 선택"
      />

      {/* 탭 */}
      <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
        {(['individual', 'aggregate'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${
              tab === t
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 font-semibold shadow-sm'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {t === 'individual' ? '📈 개별 통계' : '📊 통합 통계'}
          </button>
        ))}
      </div>

      {/* 개별 통계 */}
      {tab === 'individual' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
          {selectedId ? (
            <StatsChart
              stats={stats}
              title={selectedNovel ? `${selectedNovel.title} 조회수 추이` : '조회수 추이'}
            />
          ) : (
            <p className="text-sm text-slate-400 text-center py-8">
              작품을 선택해주세요
            </p>
          )}
        </div>
      )}

      {/* 통합 통계 */}
      {tab === 'aggregate' && aggregate && (
        <div className="space-y-3">
          {aggregate.platforms.map((platform) => {
            const data = aggregate.byPlatform[platform];
            if (!data) return null;
            return (
              <div
                key={platform}
                className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700"
              >
                <AggregateChart
                  data={data}
                  platform={platform}
                  color={PLATFORM_COLORS[platform] || '#6b7280'}
                />
              </div>
            );
          })}
          {aggregate.platforms.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">
              통합 통계 데이터가 없습니다
            </p>
          )}
        </div>
      )}
    </div>
  );
}
