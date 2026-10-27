import { Effect } from "effect"
import { Command } from "effect/cli"
import { makeApi } from "../../api/client"
import { currentSession } from "../../api/session"
import { emit } from "../../app/output"
import { describeIdentity, Identity, identityOf } from "./identity"

export const whoami = Command.make("whoami", {}, () =>
  Effect.gen(function*() {
    const session = yield* currentSession
    const me = yield* (yield* makeApi(session.apiUrl, session.token)).me.get()
    yield* emit(Identity, identityOf(me, session), describeIdentity)
  })).pipe(Command.withDescription("Show who the current token acts as, in which org"))
