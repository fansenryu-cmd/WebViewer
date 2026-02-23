/**
 * 소설 선택 드롭다운 (플랫폼별 optgroup)
 */
import { useMemo } from 'react';
import type { ManagementNovel } from '../db/types';
import { normalizePlatform, PLATFORM_ORDER } from '../utils/platform';

interface Props {
  novels: ManagementNovel[];
  value: number | null;
  onChange: (id: number | null) => void;
  label?: string;
}

export default function NovelSelector({ novels, value, onChange, label }: Props) {
  const grouped = useMemo(() => {
    const map = new Map<string, ManagementNovel[]>();
    for (const n of novels) {
      const p = normalizePlatform(n.platform);
      if (!map.has(p)) map.set(p, []);
      map.get(p)!.push(n);
    }
    // PLATFORM_ORDER 순서로 정렬
    const ordered: [string, ManagementNovel[]][] = [];
    for (const p of PLATFORM_ORDER) {
      if (map.has(p)) ordered.push([p, map.get(p)!]);
    }
    // 나머지
    for (const [p, list] of map) {
      if (!PLATFORM_ORDER.includes(p as any)) ordered.push([p, list]);
    }
    return ordered;
  }, [novels]);

  return (
    <div>
      {label && <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">{label}</label>}
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
      >
        <option value="">-- 소설 선택 --</option>
        {grouped.map(([platform, list]) => (
          <optgroup key={platform} label={platform}>
            {list.map((n) => (
              <option key={n.id} value={n.id}>
                {n.title}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
