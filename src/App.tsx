/**
 * 앱 라우팅 — DB 로드 여부에 따라 분기
 */
import { HashRouter, Routes, Route } from 'react-router-dom';
import { useDb } from './hooks/useDb';
import Layout from './components/Layout';
import LoadDbPage from './pages/LoadDbPage';
import DashboardPage from './pages/DashboardPage';
import ReportPage from './pages/ReportPage';
import StatsPage from './pages/StatsPage';
import ArchiveSpiritPage from './pages/ArchiveSpiritPage';
import RookieMonitorPage from './pages/RookieMonitorPage';

function AppRoutes() {
  const { db } = useDb();

  if (!db) return <LoadDbPage />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/report" element={<ReportPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/spirit" element={<ArchiveSpiritPage />} />
        <Route path="/rookie-monitor" element={<RookieMonitorPage />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  );
}
