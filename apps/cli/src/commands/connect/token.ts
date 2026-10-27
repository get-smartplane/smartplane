import { MaxTokenTtlDays } from "@pc/domain"
import { Effect, Option, Redacted } from "effect"
import { api } from "../../api/client"
import { usageFailure } from "../../app/failure"
import { parseDays } from "../../app/flag-values"
import type { McpAuth } from "./clients"

/** Shown in dry runs, where no token is minted. */
export const placeholderAuth: McpAuth = { type: "token", token: "<new pc_ token>" }

/**
 * A dedicated personal token per client config, never the CLI's own login token, so each can be revoked on its
 * own and shows up by name in `tokens ls` and access reviews.
 */
export const mintClientToken = (clientId: string, ttl: string) =>
  Effect.gen(function*() {
    const ttlDays = Option.filter(parseDays(ttl), (days) => days >= 1 && days <= MaxTokenTtlDays)
    if (Option.isNone(ttlDays)) return yield* usageFailure(`--ttl must be 1 to ${MaxTokenTtlDays} days.`)
    const created = yield* (yield* api).tokens.create({
      payload: { name: `smartplane connect ${clientId}`, kind: "personal", projectId: null, ttlDays: ttlDays.value }
    })
    const auth: McpAuth = { type: "token", token: Redacted.value(created.plaintext) }
    return { auth, tokenId: created.token.id }
  })
