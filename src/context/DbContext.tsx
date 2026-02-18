/**
 * DB 컨텍스트 — sql.js Database 인스턴스 제공
 */
import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { Database } from 'sql.js';

interface DbContextValue {
  db: Database | null;
  setDb: (db: Database | null) => void;
  isLoading: boolean;
  setIsLoading: (v: boolean) => void;
  error: string | null;
  setError: (v: string | null) => void;
  reset: () => void;
}

const DbContext = createContext<DbContextValue | null>(null);

export function DbProvider({ children }: { children: ReactNode }) {
  const [db, setDbState] = useState<Database | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setDb = useCallback((d: Database | null) => {
    setDbState((prev: Database | null) => {
      if (prev) prev.close();
      return d;
    });
    setError(null);
  }, []);

  const reset = useCallback(() => {
    setDbState((prev: Database | null) => {
      if (prev) prev.close();
      return null;
    });
    setError(null);
    setIsLoading(false);
  }, []);

  return (
    <DbContext.Provider
      value={{ db, setDb, isLoading, setIsLoading, error, setError, reset }}
    >
      {children}
    </DbContext.Provider>
  );
}

export function useDb(): DbContextValue {
  const ctx = useContext(DbContext);
  if (!ctx) throw new Error('useDb must be used within DbProvider');
  return ctx;
}
