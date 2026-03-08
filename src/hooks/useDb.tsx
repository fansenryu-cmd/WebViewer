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
import { loadDbFromDropbox, loadDbFromFile, loadDbFromGoogleDrive } from '../db/loader';

interface DbState {
  db: Database | null;
  loading: boolean;
  error: string | null;
  dbName: string | null;
  loadFromDropbox: (url: string, apiBase?: string) => Promise<void>;
  loadFromLocal: (file: File) => Promise<void>;
  loadFromGoogleDrive: (folderId: string, apiKey: string) => Promise<void>;
}

const DbContext = createContext<DbState>({
  db: null,
  loading: false,
  error: null,
  dbName: null,
  loadFromDropbox: async () => {},
  loadFromLocal: async () => {},
  loadFromGoogleDrive: async () => {},
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

  const loadFromGoogleDrive = useCallback(async (folderId: string, apiKey: string) => {
    setLoading(true);
    setError(null);
    try {
      const { db: instance, fileName } = await loadDbFromGoogleDrive(folderId, apiKey);
      setDb(instance);
      setDbName(`Google Drive: ${fileName}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Google Drive DB 로드 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <DbContext.Provider value={{ db, loading, error, dbName, loadFromDropbox, loadFromLocal, loadFromGoogleDrive }}>
      {children}
    </DbContext.Provider>
  );
}

export function useDb() {
  return useContext(DbContext);
}
