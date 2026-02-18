/**
 * App — DB 초기화 + 라우팅
 */
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { DbProvider, useDb } from './context/DbContext';
import { InitScreen } from './components/InitScreen';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { NovelStatsPage } from './pages/NovelStatsPage';
import { TodayReportPage } from './pages/TodayReportPage';
import { HistoryReportPage } from './pages/HistoryReportPage';
import { AggregateStatsPage } from './pages/AggregateStatsPage';
import { ArchiveSpiritPage } from './pages/ArchiveSpiritPage';
import { SettingsPage } from './pages/SettingsPage';

function AppContent() {
  const { db } = useDb();

  if (!db) {
    return <InitScreen />;
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/novel/:id" element={<NovelStatsPage />} />
        <Route path="/today" element={<TodayReportPage />} />
        <Route path="/history" element={<HistoryReportPage />} />
        <Route path="/aggregate" element={<AggregateStatsPage />} />
        <Route path="/archive-spirit" element={<ArchiveSpiritPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <DbProvider>
      <AppContent />
    </DbProvider>
  );
}
