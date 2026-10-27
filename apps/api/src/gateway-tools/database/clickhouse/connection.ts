import { Redacted, Schema, SchemaTransformation } from "effect"

/** Where and as whom a statement is sent. The password never goes in the URL, only in a request header. */
export const ClickHouseEndpoint = Schema.Struct({
  /** `https://host:port/` (or `http://` for a loopback host). */
  url: Schema.String,
  user: Schema.String,
  password: Schema.Redacted(Schema.String),
  /** Empty for the login's default database. */
  database: Schema.String
})
export type ClickHouseEndpoint = typeof ClickHouseEndpoint.Type

const SecurePort = "8443"
const loopbackHosts: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"])

/**
 * `clickhouse://` means HTTPS (ClickHouse Cloud and most servers listen on 8443). Plain `http://` would send
 * the password in clear, so it is accepted only for a loopback host (local development).
 */
const supported = Schema.makeFilter<URL>((url) => {
  if (url.hostname === "") return "expected a host"
  if (url.protocol === "https:" || url.protocol === "clickhouse:") return true
  if (url.protocol === "http:" && loopbackHosts.has(url.hostname)) return true
  return "expected https://user:password@host:8443/database or clickhouse://user:password@host/database"
})

const toEndpoint = (url: URL): ClickHouseEndpoint => {
  const scheme = url.protocol === "http:" ? "http" : "https"
  const port = url.port === "" ? (url.protocol === "clickhouse:" ? SecurePort : "") : url.port
  return {
    url: `${scheme}://${url.hostname}${port === "" ? "" : `:${port}`}/`,
    user: decodeURIComponent(url.username) || "default",
    password: Redacted.make(decodeURIComponent(url.password)),
    database: decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, ""))
  }
}

const toUrl = (endpoint: ClickHouseEndpoint): URL => {
  const url = new URL(endpoint.database, endpoint.url)
  url.username = encodeURIComponent(endpoint.user)
  url.password = encodeURIComponent(Redacted.value(endpoint.password))
  return url
}

/** The connection secret of a ClickHouse database resource, e.g. `https://agent:pw@ch.example.com:8443/analytics`. */
export const ClickHouseConnection = Schema.String.pipe(
  Schema.decodeTo(Schema.URL, SchemaTransformation.urlFromString),
  Schema.check(supported),
  Schema.decodeTo(ClickHouseEndpoint, SchemaTransformation.transform({ decode: toEndpoint, encode: toUrl }))
)
