/// <reference types="vite/client" />

declare module 'sql.js' {
  export interface Database {
    run(sql: string, params?: unknown[]): void;
    exec(sql: string): { columns: string[]; values: unknown[][] }[];
    close(): void;
    prepare(sql: string): {
      bind(params: (string | number | null)[]): void;
      step(): boolean;
      getAsObject(): Record<string, unknown>;
      free(): void;
    };
  }
  export default function initSqlJs(config?: { locateFile?: (file: string) => string }): Promise<{
    Database: new (data?: Uint8Array) => Database;
  }>;
}
