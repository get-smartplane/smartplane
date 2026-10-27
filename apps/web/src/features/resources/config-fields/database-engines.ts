import { DatabaseEngine } from "@pc/domain"
import { Schema } from "effect"

interface EngineInfo {
  readonly label: string
  /** What the connection secret should hold. */
  readonly connectionHint: string
}

export const databaseEngines: { readonly [E in DatabaseEngine]: EngineInfo } = {
  postgres: { label: "PostgreSQL", connectionHint: "Reached over TCP. Secret: postgres://user:password@host:5432/database" },
  mysql: { label: "MySQL", connectionHint: "Reached over TCP. Secret: mysql://user:password@host:3306/database" },
  clickhouse: {
    label: "ClickHouse",
    connectionHint:
      "Reached over HTTPS. Secret: https://user:password@host:8443/database (clickhouse:// also means HTTPS). Use a login without a readonly settings profile; Smartplane sets readonly per query."
  }
}

const isEngine = Schema.is(DatabaseEngine)

/** The draft holds the select's raw value; anything unknown shows as itself. */
export const engineInfo = (engine: string): EngineInfo | null => (isEngine(engine) ? databaseEngines[engine] : null)
