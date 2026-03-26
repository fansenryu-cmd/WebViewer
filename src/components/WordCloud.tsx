/**
 * WordCloud - 키워드/장르를 빈도에 비례한 크기의 칩으로 표시
 */

interface WordCloudItem {
  text: string;
  count: number;
  type?: 'keyword' | 'genre';
}

interface WordCloudProps {
  items: WordCloudItem[];
  maxItems?: number;
  platformColor?: string;
}

export default function WordCloud({
  items,
  maxItems = 30,
  platformColor = '#3b82f6',
}: WordCloudProps) {
  const displayed = items.slice(0, maxItems);

  if (displayed.length === 0) {
    return (
      <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-4">
        데이터 없음
      </p>
    );
  }

  const counts = displayed.map((d) => d.count);
  const minCount = Math.min(...counts);
  const maxCount = Math.max(...counts);
  const range = maxCount - minCount || 1;

  // Font size: 0.75rem (min) ~ 1.5rem (max)
  const getFontSize = (count: number): string => {
    const ratio = (count - minCount) / range;
    const size = 0.75 + ratio * 0.75;
    return `${size}rem`;
  };

  // Opacity: 0.5 (min) ~ 1.0 (max)
  const getOpacity = (count: number): number => {
    const ratio = (count - minCount) / range;
    return 0.5 + ratio * 0.5;
  };

  return (
    <div className="flex flex-wrap gap-1.5 justify-center">
      {displayed.map((item) => {
        const isGenre = item.type === 'genre';
        const fontSize = getFontSize(item.count);
        const opacity = getOpacity(item.count);

        return (
          <span
            key={`${item.type ?? 'keyword'}-${item.text}`}
            className={`
              inline-flex items-center gap-1 px-2 py-0.5 rounded-full
              cursor-default transition-all hover:scale-105
              group relative
              ${isGenre
                ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300'
                : 'text-slate-800 dark:text-slate-100'
              }
            `}
            style={{
              fontSize,
              ...(isGenre
                ? {}
                : {
                    backgroundColor: `${platformColor}${Math.round(opacity * 0.3 * 255).toString(16).padStart(2, '0')}`,
                  }),
            }}
            title={`${item.text}: ${item.count}회`}
          >
            {item.text}
            <span
              className="
                text-[0.625rem] font-mono leading-none
                opacity-0 group-hover:opacity-100 transition-opacity
                bg-slate-800 dark:bg-slate-200
                text-white dark:text-slate-800
                px-1 py-0.5 rounded
                absolute -top-5 left-1/2 -translate-x-1/2
                pointer-events-none whitespace-nowrap z-10
              "
            >
              {item.count}
            </span>
          </span>
        );
      })}
    </div>
  );
}
