/**
 * 레이아웃 — 사이드 내비게이션 + 콘텐츠 (데스크톱/모바일 반응형, V2 고도화)
 * 모바일: 하단 탭바(터치 44px), safe-area, 콘텐츠 하단 여백
 */
import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const NAV_ITEMS = [
  { path: '/', label: '홈', icon: '📚' },
  { path: '/today', label: '투데이', icon: '📊' },
  { path: '/history', label: '역대', icon: '📜' },
  { path: '/aggregate', label: '통계', icon: '📈' },
  { path: '/compare', label: '비교', icon: '🔀' },
  { path: '/hall-of-fame', label: '명예', icon: '🏆' },
  { path: '/archive-spirit', label: '정령', icon: '✨' },
  { path: '/settings', label: '설정', icon: '⚙️' },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  return (
    <div className="min-h-screen flex bg-gray-50 min-h-[100dvh]">
      {/* 사이드바 (데스크톱) */}
      <aside className="w-52 bg-white border-r border-gray-200 hidden sm:flex flex-col flex-shrink-0">
        <div className="p-4 border-b">
          <Link to="/" className="font-bold text-gray-900 text-lg">📖 NovelForge</Link>
        </div>
        <nav className="p-2 flex-1">
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* 메인 콘텐츠 — 모바일 하단 탭바 높이만큼 padding */}
      <main
        className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8"
        style={{
          paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
          marginBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <div className="pb-16 sm:pb-0">{children}</div>
      </main>

      {/* 모바일 하단 탭바 — 터치 타겟 44px 이상, safe-area */}
      <nav
        className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-gray-200 flex sm:hidden z-50"
        style={{
          paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))',
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)',
        }}
      >
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className="flex-1 flex flex-col items-center justify-center min-h-[44px] py-2 text-xs transition-colors active:bg-gray-100"
              style={{ minHeight: 44 }}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className={`text-lg mb-0.5 ${isActive ? 'text-blue-600' : 'text-gray-500'}`}>{item.icon}</span>
              <span className={isActive ? 'text-blue-600 font-medium' : 'text-gray-500'}>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
