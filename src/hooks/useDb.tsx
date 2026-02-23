/**
 * DB Context — 앱 전체에서 sql.js Database 인스턴스 공유
 */
import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import type { Database } from 'sql.js';
import { loadDbFromDropbox, loadDbFromFile } from '../db/loader';

interface DbState {
  db: Database | null;
  loading: boolean;
  error: string | null;
  dbName: string | null;
  loadFromDropbox: (url: string, apiBase?: string) => Promise<void>;
  loadFromLocal: (file: File) => Promise<void>;
}

const DbContext = createContext<DbState>({
  db: null,
  loading: false,
  error: null,
  dbName: null,
  loadFromDropbox: async () => {},
  loadFromLocal: async () => {},
});

export function DbProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Database | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dbName, setDbName] = useState<string | null>(null);

  const loadFromDropbox = useCallback(async (url: string, apiBase?: string) => {
    setLoading(true);
    setError(null);
    try {
      const instance = await loadDbFromDropbox(url, apiBase);
      setDb(instance);
      setDbName('Dropbox DB');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'DB 로드 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFromLocal = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const instance = await loadDbFromFile(file);
      setDb(instance);
      setDbName(file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'DB 로드 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <DbContext.Provider value={{ db, loading, error, dbName, loadFromDropbox, loadFromLocal }}>
      {children}
    </DbContext.Provider>
  );
}

export function useDb() {
  return useContext(DbContext);
}
