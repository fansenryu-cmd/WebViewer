/**
 * 레이아웃 — 사이드 내비게이션 + 콘텐츠 (넓은 화면 최적화)
 */
import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const NAV_ITEMS = [
  { path: '/', label: '홈', icon: '📚' },
  { path: '/today', label: '투데이 리포트', icon: '📊' },
  { path: '/history', label: '역대 리포트', icon: '📜' },
  { path: '/aggregate', label: '통합 통계', icon: '📈' },
  { path: '/archive-spirit', label: '아카이브의 정령', icon: '✨' },
  { path: '/settings', label: '설정', icon: '⚙️' },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  return (
    <div className="min-h-screen flex bg-gray-50">
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

      {/* 메인 콘텐츠 — 넓은 폭 */}
      <main className="flex-1 overflow-auto p-4 pb-20 sm:p-6 sm:pb-6 lg:p-8">
        {children}
      </main>

      {/* 모바일 하단 탭바 */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex sm:hidden z-50"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {NAV_ITEMS.slice(0, 5).map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex-1 flex flex-col items-center justify-center py-2 text-xs transition-colors ${
                isActive ? 'text-blue-600 font-medium' : 'text-gray-500'
              }`}
            >
              <span className="text-lg mb-0.5">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
