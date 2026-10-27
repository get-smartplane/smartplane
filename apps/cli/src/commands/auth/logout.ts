import { Effect, Option } from "effect"
import { Command, Flag } from "effect/cli"
import { makeApi } from "../../api/client"
import { currentTarget } from "../../api/session"
import { emit } from "../../app/output"
import { Credentials } from "../../config/credentials"
import { Schema } from "effect"

const revoke = Flag.Boolean("revoke").pipe(Flag.withDescription("Also revoke the token on the server"), Flag.withDefault(false))

const LogoutResult = Schema.Struct({ profile: Schema.String, removed: Schema.Boolean, revoked: Schema.Boolean })

export const logout = Command.make("logout", { revoke }, ({ revoke }) =>
  Effect.gen(function*() {
    const target = yield* currentTarget
    let revoked = false
    if (revoke && Option.isSome(target.saved)) {
      const api = yield* makeApi(target.apiUrl, target.saved.value.token)
      const { principal } = yield* api.me.get()
      if (principal.tokenId !== null) {
        yield* api.tokens.revoke({ params: { id: principal.tokenId } })
        revoked = true
      }
    }
    const removed = yield* (yield* Credentials).remove(target.profile)
    yield* emit(LogoutResult, { profile: target.profile, removed, revoked }, (result) =>
      [
        result.removed ? `Removed profile "${result.profile}".` : `No saved login for profile "${result.profile}".`,
        ...(result.revoked ? ["The token was revoked."] : [])
      ].join("\n"))
  })).pipe(Command.withDescription("Forget the saved token for a profile"))
