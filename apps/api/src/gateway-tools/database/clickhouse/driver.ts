import { Option, Redacted, Schema } from "effect"
import type { SqlDriver, SqlOptions, SqlStatement } from "../driver"
import { ClickHouseConnection, type ClickHouseEndpoint } from "./connection"
import { ClickHouseError, clickHouseError } from "./errors"
import { sqlResultOf } from "./response"
import { requestSettings, timeoutSeconds } from "./settings"
import { isReadStatement, leadingKeyword, queryParameters } from "./statement"
import { tableFunctionRefusal } from "./table-functions"

export type Fetch = (request: Request) => Promise<Response>

/** The decode issue would quote the input, which is the connection string: report only what was expected. */
const decodeConnection = (connection: Redacted.Redacted<string>): ClickHouseEndpoint =>
  Option.getOrThrowWith(
    Schema.decodeUnknownOption(ClickHouseConnection)(Redacted.value(connection)),
    () => new ClickHouseError({ code: null, message: "the connection secret is not a ClickHouse URL (https://user:password@host:8443/database)" })
  )

/** The gateway aborts a little after the server-side limit, so a server timeout is reported as ClickHouse's. */
const AbortMarginMs = 4_000

const requestFor = (endpoint: ClickHouseEndpoint, statement: SqlStatement, options: SqlOptions): Request => {
  const url = new URL(endpoint.url)
  for (const [key, value] of [...requestSettings(options), ...queryParameters(statement.params)]) url.searchParams.append(key, value)
  if (endpoint.database !== "") url.searchParams.set("database", endpoint.database)
  return new Request(url, {
    method: "POST",
    headers: { "X-ClickHouse-User": endpoint.user, "X-ClickHouse-Key": Redacted.value(endpoint.password), "Content-Type": "text/plain; charset=utf-8" },
    body: statement.sql,
    signal: AbortSignal.timeout(options.timeoutMs + AbortMarginMs)
  })
}

const send = async (fetch: Fetch, request: Request, options: SqlOptions): Promise<Response> => {
  try {
    return await fetch(request)
  } catch (cause) {
    const timedOut = cause instanceof DOMException && (cause.name === "TimeoutError" || cause.name === "AbortError")
    throw new ClickHouseError({
      code: null,
      message: timedOut ? `ClickHouse did not answer within ${timeoutSeconds(options)}s` : `could not reach ClickHouse at ${new URL(request.url).host}`
    })
  }
}

/**
 * ClickHouse over its HTTP(S) interface with `fetch` (no TCP socket). One statement per request: the server
 * refuses multi-statement bodies. Credentials go in `X-ClickHouse-User`/`X-ClickHouse-Key`, never the URL.
 */
export const makeClickHouseDriver = (fetch: Fetch): SqlDriver => ({
  execute: async (connection, statement, options) => {
    const endpoint = decodeConnection(connection)
    if (options.readOnly && !isReadStatement(statement.sql)) {
      throw new ClickHouseError({ code: null, message: `a read-only grant runs only SELECT, WITH, SHOW, DESCRIBE, EXPLAIN or EXISTS, not ${leadingKeyword(statement.sql) || "this statement"}` })
    }
    const refusal = options.readOnly ? tableFunctionRefusal(statement.sql) : undefined
    if (refusal !== undefined) throw new ClickHouseError({ code: null, message: refusal })
    const response = await send(fetch, requestFor(endpoint, statement, options), options)
    const body = await response.text()
    if (!response.ok) {
      throw clickHouseError({
        status: response.status,
        codeHeader: response.headers.get("X-ClickHouse-Exception-Code"),
        body,
        user: endpoint.user,
        timeoutSeconds: timeoutSeconds(options)
      })
    }
    return sqlResultOf(body, response.headers.get("X-ClickHouse-Summary"), options.maxRows)
  }
})

export const clickhouseDriver: SqlDriver = makeClickHouseDriver((request) => fetch(request))
