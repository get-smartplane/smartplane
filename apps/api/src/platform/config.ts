import { HttpUrl } from "@pc/domain"
import { Context, Effect, Layer, Schema } from "effect"

const NonEmpty = Schema.NonEmptyString
const Secret = Schema.Redacted(NonEmpty)

/** wrangler treats an empty var as "set"; an empty OTLP endpoint means "telemetry off". */
const OptionalUrl = Schema.optionalKey(Schema.Union([HttpUrl, Schema.Literal("")]))

export const EnvConfig = Schema.Struct({
  APP_URL: HttpUrl,
  API_URL: HttpUrl,
  ENVIRONMENT: NonEmpty,
  CLASSIFIER_MODEL: NonEmpty,
  COMPILER_MODEL: NonEmpty,
  /** Off the request path (example calls, the self-test's recompile): slower is fine, quality matters. Defaults to COMPILER_MODEL. */
  BACKGROUND_MODEL: Schema.optionalKey(NonEmpty),
  OTEL_EXPORTER_OTLP_ENDPOINT: OptionalUrl,
  WORKOS_API_KEY: Secret,
  WORKOS_CLIENT_ID: NonEmpty,
  /** iron-session requires at least 32 characters. */
  WORKOS_COOKIE_PASSWORD: Schema.Redacted(Schema.String.check(Schema.isMinLength(32))),
  WORKOS_WEBHOOK_SECRET: Secret,
  /** Base64 of a 32-byte AES-KW key. */
  SECRETS_KEK: Secret,
  SECRETS_KEK_ID: NonEmpty,
  /**
   * Retired KEKs still needed to open data keys until `secrets.rewrap` has moved them to the current one:
   * a JSON object `{ "<kek id>": "<base64 key>" }`. Empty or unset when no rotation is in progress.
   */
  SECRETS_PREVIOUS_KEKS: Schema.optionalKey(Schema.Redacted(Schema.String)),
  /**
   * MCP OAuth: the AuthKit domain (e.g. `acme.authkit.app`, or a custom auth domain) that issues access
   * tokens for /mcp. Empty or unset turns MCP OAuth off; `pc_` tokens keep working either way.
   */
  WORKOS_AUTHKIT_DOMAIN: Schema.optionalKey(Schema.String),
  /** Expected `aud` of MCP access tokens; defaults to `<API_URL>/mcp`, the resource indicator to configure in AuthKit. */
  MCP_OAUTH_AUDIENCE: Schema.optionalKey(Schema.String),
  /** Experimental skill scanning (builtin rules + Clef). Unset or "off": nothing is scanned or queued, nothing is gated. */
  SKILL_SCANNING: Schema.optionalKey(Schema.Literals(["off", "on"]))
}).annotate({ identifier: "EnvConfig" })
export type EnvConfig = typeof EnvConfig.Type

const decodeEnv = (env: unknown) => Schema.decodeUnknownEffect(Schema.toCodecJson(EnvConfig))(env, { errors: "all" })

/**
 * The names of the settings a decode failure points at. Only paths, never values: the formatted issue would
 * print what was received, and several of these settings are secrets.
 */
export const invalidSettings = (issue: unknown, path: ReadonlyArray<PropertyKey> = []): ReadonlyArray<string> => {
  if (typeof issue !== "object" || issue === null) return []
  const fields: Record<string, unknown> = { ...issue }
  if (fields["_tag"] === "Pointer" && Array.isArray(fields["path"])) {
    const nested: ReadonlyArray<PropertyKey> = fields["path"].filter((key): key is PropertyKey => typeof key === "string" || typeof key === "number")
    return invalidSettings(fields["issue"], [...path, ...nested])
  }
  if (Array.isArray(fields["issues"])) return [...new Set(fields["issues"].flatMap((inner) => invalidSettings(inner, path)))]
  if (fields["issue"] !== undefined) return invalidSettings(fields["issue"], path)
  return path.length === 0 ? [] : [path.map(String).join(".")]
}

export class AppConfig extends Context.Service<AppConfig, EnvConfig>()("api/platform/AppConfig") {
  /** Misconfiguration is a defect: the Worker cannot serve anything meaningful without it. */
  static readonly fromEnv = (env: unknown) =>
    Layer.effect(
      AppConfig,
      decodeEnv(env).pipe(
        Effect.mapError((error) => new Error(`Invalid Worker configuration: ${invalidSettings(error.issue).join(", ") || "unknown setting"} (values not shown)`)),
        Effect.orDie
      )
    )
}

export const skillScanningEnabled = (config: EnvConfig): boolean => config.SKILL_SCANNING === "on"

export const otlpEndpoint = (config: EnvConfig): string | undefined =>
  config.OTEL_EXPORTER_OTLP_ENDPOINT === "" ? undefined : config.OTEL_EXPORTER_OTLP_ENDPOINT

/** The model for background work (example calls, recompiles): `BACKGROUND_MODEL`, else the compiler's. */
export const backgroundModel = (config: EnvConfig): string => config.BACKGROUND_MODEL ?? config.COMPILER_MODEL
