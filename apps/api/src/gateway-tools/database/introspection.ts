import type { DatabaseEngine } from "@pc/domain"
import type { SqlStatement } from "./driver"

/** Columns of user tables, optionally of one table: what `<db>__schema` returns. */
export const schemaStatement = (engine: DatabaseEngine, table: string | null): SqlStatement => {
  switch (engine) {
    case "postgres":
      return {
        sql: `SELECT table_schema, table_name, column_name, data_type, is_nullable
                FROM information_schema.columns
               WHERE table_schema NOT IN ('pg_catalog', 'information_schema') AND ($1::text IS NULL OR table_name = $1::text)
               ORDER BY table_schema, table_name, ordinal_position`,
        params: [table]
      }
    case "mysql":
      return {
        sql: `SELECT table_schema, table_name, column_name, data_type, is_nullable
                FROM information_schema.columns
               WHERE table_schema = DATABASE() AND (? IS NULL OR table_name = ?)
               ORDER BY table_name, ordinal_position`,
        params: [table, table]
      }
    case "clickhouse":
      return {
        sql: `SELECT c.database AS table_schema, c.table AS table_name, c.name AS column_name, c.type AS data_type,
                     if(startsWith(c.type, 'Nullable('), 'YES', 'NO') AS is_nullable, t.engine AS table_engine
                FROM system.columns AS c
               INNER JOIN system.tables AS t ON t.database = c.database AND t.name = c.table
               WHERE c.database = currentDatabase() AND ({p1:Nullable(String)} IS NULL OR c.table = {p1:Nullable(String)})
               ORDER BY c.table, c.position`,
        params: [table]
      }
  }
}
