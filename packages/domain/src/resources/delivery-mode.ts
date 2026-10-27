import { Schema } from "effect"
import { isLoaderEnvName } from "./loader-env"

/**
 * Whether a secret's value may leave Smartplane. `gateway_only` (the default, also when absent): usable only
 * through gateway tools, never returned. `deliverable`: an admin opted in to `POST /api/secrets/deliver`
 * (`smartplane run`, service boot). A literal union so a future `proxy_only` mode can join it.
 */
export const SecretDelivery = Schema.Literals(["gateway_only", "deliverable"]).annotate({ identifier: "SecretDelivery" })
export type SecretDelivery = typeof SecretDelivery.Type

/** An environment variable name as delivered to a process; never one that changes how it loads code. */
export const EnvName = Schema.String.check(
  Schema.isPattern(/^[A-Z_][A-Z0-9_]{0,127}$/),
  Schema.makeFilter((name: string) => !isLoaderEnvName(name) || `${name} changes how processes load code, so it cannot be delivered`)
).annotate({ identifier: "EnvName" })
export type EnvName = typeof EnvName.Type

const isEnvName = Schema.is(EnvName)

/**
 * The env name a resource is delivered under when none is set: its name upper-snake-cased
 * (`stripe-key` → `STRIPE_KEY`, `2fa seed` → `_2FA_SEED`). `undefined` when nothing usable remains.
 */
export const envNameFromName = (name: string): EnvName | undefined => {
  const snake = name.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase()
  const candidate = (/^[0-9]/.test(snake) ? `_${snake}` : snake).slice(0, 128)
  return isEnvName(candidate) ? candidate : undefined
}
