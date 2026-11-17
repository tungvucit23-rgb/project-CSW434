import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { config } from "./config.js";

// PostgreSQL DATE is a calendar date, not a local-midnight JS timestamp.
// Keep YYYY-MM-DD unchanged even when the Node host runs in UTC+07:00.
pg.types.setTypeParser(1082, (value: string) => value);

export interface Queryable {
  query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[] }>;
}
class Mutex {
  private tail = Promise.resolve();
  async run<T>(callback: () => Promise<T>): Promise<T> {
    const before = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((r) => {
      release = r;
    });
    await before;
    try {
      return await callback();
    } finally {
      release();
    }
  }
}
export class Database implements Queryable {
  readonly kind: "postgresql" | "pglite";
  private mutex = new Mutex();
  private lite?: PGlite;
  private pool?: pg.Pool;
  constructor(url = config.databaseUrl, directory = config.dataDir) {
    this.kind = url ? "postgresql" : "pglite";
    if (url) this.pool = new pg.Pool({ connectionString: url, max: 8 });
    // PGlite initdb needs an empty directory. The parent also stores .jwt-secret.
    else {
      if (directory !== ":memory:") mkdirSync(directory, { recursive: true });
      this.lite = new PGlite(
        directory === ":memory:" ? undefined : resolve(directory, "postgres"),
      );
    }
  }
  async query<T = any>(
    sql: string,
    params: any[] = [],
  ): Promise<{ rows: T[] }> {
    if (this.pool) {
      const result = await this.pool.query(sql, params);
      return { rows: result.rows as T[] };
    }
    return this.mutex.run(async () => this.lite!.query<T>(sql, params));
  }
  async transaction<T>(callback: (tx: Queryable) => Promise<T>): Promise<T> {
    if (this.pool) {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        const value = await callback(client);
        await client.query("COMMIT");
        return value;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
    return this.mutex.run(async () => {
      await this.lite!.query("BEGIN");
      const tx: Queryable = {
        query: async <R>(sql: string, params: any[] = []) =>
          this.lite!.query<R>(sql, params),
      };
      try {
        const value = await callback(tx);
        await this.lite!.query("COMMIT");
        return value;
      } catch (error) {
        await this.lite!.query("ROLLBACK");
        throw error;
      }
    });
  }
  async migrate() {
    const sql = await readFile(
      new URL("../migrations/001_initial.sql", import.meta.url),
      "utf8",
    );
    if (this.pool) await this.pool.query(sql);
    else
      await this.mutex.run(async () => {
        await this.lite!.exec(sql);
      });
  }
  async close() {
    if (this.pool) await this.pool.end();
    else await this.lite!.close();
  }
}
export const db = new Database();
export async function one<T = any>(
  sql: string,
  params: any[] = [],
  q: Queryable = db,
): Promise<T | undefined> {
  return (await q.query<T>(sql, params)).rows[0];
}
