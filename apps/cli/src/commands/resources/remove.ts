import { Effect, Schema } from "effect"
import { Argument, Command } from "effect/cli"
import { api } from "../../api/client"
import { yesFlag } from "../../app/common-flags"
import { emit } from "../../app/output"
import { confirm } from "../../app/secret-input"
import { resolveResource } from "../../resolve/entities"

const target = Argument.String("resource").pipe(Argument.withDescription("Resource name or id"))

export const Removed = Schema.Struct({ id: Schema.String, removed: Schema.Literal(true) })

export const removeResource = Command.make("rm", { target, yes: yesFlag }, ({ target, yes }) =>
  Effect.gen(function*() {
    const client = yield* api
    const id = yield* resolveResource(client)(target)
    yield* confirm(`Remove ${target} and revoke every grant on it?`, yes)
    yield* client.resources.remove({ params: { id } })
    yield* emit(Removed, { id, removed: true }, () => `Removed ${target} (${id}); its grants are revoked.`)
  })).pipe(Command.withDescription("Remove a resource and revoke its grants"), Command.withAlias("remove"))
