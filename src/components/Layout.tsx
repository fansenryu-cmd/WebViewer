/**
 * 앱 레이아웃 — 하단 네비게이션 (모바일 최적화)
 */
import { NavLink } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import { useDb } from '../hooks/useDb';

const NAV_ITEMS = [
  { to: '/', icon: '📊', label: '대시보드' },
  { to: '/report', icon: '📰', label: '리포트' },
  { to: '/stats', icon: '📈', label: '통계' },
  { to: '/rookie-monitor', icon: '🖥️', label: '신작' },
  { to: '/spirit', icon: '🔮', label: '정령' },
] as const;

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

      {/* 하단 네비게이션 */}
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-white/90 dark:bg-slate-800/90 backdrop-blur border-t border-slate-200 dark:border-slate-700 flex">
        {NAV_ITEMS.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center py-2 text-xs transition-colors ${
                isActive
                  ? 'text-blue-600 dark:text-blue-400 font-semibold'
                  : 'text-slate-500 dark:text-slate-400'
              }`
            }
          >
            <span className="text-lg">{icon}</span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
