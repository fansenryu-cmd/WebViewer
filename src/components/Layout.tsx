/**
 * 앱 레이아웃 — 하단 네비게이션 (모바일 최적화, 그룹화)
 */
import { NavLink } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import { useDb } from '../hooks/useDb';

interface NavItem {
  to: string;
  icon: string;
  label: string;
}

interface NavGroup {
  groupLabel: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    groupLabel: '라이브러리',
    items: [
      { to: '/', icon: '🏠', label: '대시보드' },
      { to: '/library', icon: '📚', label: '소설 목록' },
      { to: '/report', icon: '📊', label: '투데이 리포트' },
    ],
  },
  {
    groupLabel: '분석',
    items: [
      { to: '/views-growth', icon: '📈', label: '조회수 상승' },
      { to: '/compare', icon: '🔄', label: '다중 비교' },
      { to: '/stats', icon: '📉', label: '통계' },
      { to: '/episode', icon: '🧬', label: '에피소드 분석' },
    ],
  },
  {
    groupLabel: '리서치',
    items: [
      { to: '/title-analysis', icon: '🔍', label: '제목 분석' },
      { to: '/trend-infographic', icon: '📊', label: '트렌드 인포' },
      { to: '/deep-analysis', icon: '🔬', label: '심층 분석' },
      { to: '/long-term-analysis', icon: '📅', label: '장기 분석' },
      { to: '/rookie-monitor', icon: '🌱', label: '신작 모니터' },
    ],
  },
  {
    groupLabel: 'AI',
    items: [
      { to: '/spirit', icon: '🤖', label: '아카이브의 정령' },
    ],
  },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { toggle, isDark } = useTheme();
  const { dbName } = useDb();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-900 transition-colors">
      {/* 헤더 */}
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-slate-800/80 backdrop-blur border-b border-slate-200 dark:border-slate-700 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            NovelForge
          </span>
          {dbName && (
            <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded-full">
              {dbName}
            </span>
          )}
        </div>
        <button
          onClick={toggle}
          className="relative flex items-center h-7 w-[52px] rounded-full transition-colors duration-300"
          style={{
            background: isDark
              ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
              : '#e2e8f0',
          }}
          aria-label="다크 모드 토글"
        >
          <span
            className={`absolute top-[3px] flex items-center justify-center w-[22px] h-[22px] rounded-full bg-white shadow-md transition-all duration-300 ${
              isDark ? 'left-[27px]' : 'left-[3px]'
            }`}
          >
            <span className="text-xs">{isDark ? '🌙' : '☀️'}</span>
          </span>
        </button>
      </header>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 overflow-auto pb-16">{children}</main>

      {/* 하단 네비게이션 (그룹화, 스크롤 가능) */}
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-white/90 dark:bg-slate-800/90 backdrop-blur border-t border-slate-200 dark:border-slate-700 flex overflow-x-auto scrollbar-hide">
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.groupLabel} className="flex items-end flex-shrink-0">
            {/* 그룹 구분선 (첫 그룹 제외) */}
            {gi > 0 && (
              <div className="w-px h-8 bg-slate-200 dark:bg-slate-700 self-center flex-shrink-0" />
            )}
            <div className="flex flex-col items-center flex-shrink-0">
              {/* 그룹 라벨 */}
              <span className="text-[8px] text-slate-400 dark:text-slate-500 font-medium tracking-wide pt-0.5 px-1 whitespace-nowrap">
                {group.groupLabel}
              </span>
              {/* 그룹 내 아이템들 */}
              <div className="flex">
                {group.items.map(({ to, icon, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/'}
                    className={({ isActive }) =>
                      `flex-shrink-0 min-w-[52px] flex flex-col items-center pb-1.5 pt-0.5 px-1 text-[9px] transition-colors ${
                        isActive
                          ? 'text-blue-600 dark:text-blue-400 font-semibold'
                          : 'text-slate-500 dark:text-slate-400'
                      }`
                    }
                  >
                    <span className="text-sm leading-none">{icon}</span>
                    <span className="whitespace-nowrap mt-0.5">{label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
}
