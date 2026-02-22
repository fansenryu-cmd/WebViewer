/**
 * 명예의 전당 (V2) — TOP100 누적 체류일 랭킹
 */
import React, { useMemo, useState } from 'react';
import { useDb } from '../context/DbContext';
import { getHallOfFame, getRankingPlatformsForHallOfFame } from '../db/queries';

const PLATFORMS = ['네이버시리즈', '카카오페이지', '문피아(무료)', '문피아(유료)', '리디', '노벨피아'];

export function HallOfFamePage() {
  const { db } = useDb();
  const [platform, setPlatform] = useState<string | null>(null);

  const items = useMemo(() => {
    if (!db) return [];
    return getHallOfFame(db, platform, 25);
  }, [db, platform]);

  const platforms = useMemo(() => (db ? getRankingPlatformsForHallOfFame(db) : []), [db]);
  const filterPlatforms = platforms.length > 0 ? platforms : PLATFORMS;

  if (!db) return null;

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">🏆 명예의 전당</h1>
      <p className="text-gray-600 mb-4">TOP100 누적 체류일 순위 (랭킹에 가장 오래 등장한 작품)</p>

      <div className="flex flex-wrap gap-2 mb-4">
        <button
          type="button"
          onClick={() => setPlatform(null)}
          className={`px-3 py-1.5 text-sm rounded-lg ${!platform ? 'bg-amber-100 border border-amber-300 font-medium' : 'bg-gray-100 hover:bg-gray-200'}`}
        >
          전체
        </button>
        {filterPlatforms.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPlatform(p)}
            className={`px-3 py-1.5 text-sm rounded-lg ${platform === p ? 'bg-amber-100 border border-amber-300 font-medium' : 'bg-gray-100 hover:bg-gray-200'}`}
          >
            {p}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="text-gray-500 py-8">랭킹 데이터가 없습니다. 데스크톱에서 랭킹 수집 후 DB를 불러와 주세요.</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b bg-gray-50">
                  <th className="py-2 px-3 font-medium">#</th>
                  <th className="py-2 px-3 font-medium">제목</th>
                  <th className="py-2 px-3 font-medium">작가</th>
                  <th className="py-2 px-3 font-medium text-right">TOP100 체류</th>
                  <th className="py-2 px-3 font-medium text-right">최고 순위</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row, idx) => (
                  <tr key={`${row.title}-${row.platform}-${idx}`} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-3 text-gray-500 font-medium">{idx + 1}</td>
                    <td className="py-2 px-3 font-medium text-gray-900">{row.title}</td>
                    <td className="py-2 px-3 text-gray-600">{row.author}</td>
                    <td className="py-2 px-3 text-right text-amber-600 font-medium">{row.days_in_top100}일</td>
                    <td className="py-2 px-3 text-right text-blue-600">{row.best_rank}위</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
