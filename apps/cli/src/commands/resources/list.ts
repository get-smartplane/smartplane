import { Resource } from "@pc/domain"
import { Effect, Option, Schema } from "effect"
import { Command, Flag } from "effect/cli"
import { api } from "../../api/client"
import { field, projectFlag } from "../../app/common-flags"
import { emit } from "../../app/output"
import { resolveProject } from "../../resolve/entities"
import { resourceTable } from "./describe"
import { kindChoices } from "./kinds"

const kind = Flag.ChoiceWithValue("kind", kindChoices).pipe(Flag.withDescription("Only this kind"), Flag.optional)

export const listResources = Command.make("ls", { kind, project: projectFlag }, (flags) =>
  Effect.gen(function*() {
    const client = yield* api
    const projectId = yield* Effect.transposeOption(Option.map(flags.project, resolveProject(client)))
    const resources = yield* client.resources.list({
      query: { ...field("kind", flags.kind), ...field("projectId", projectId) }
    })
    yield* emit(Schema.Array(Resource), resources, resourceTable)
  })).pipe(
    // The API decides what is listed: everything for resources:manage, else only what you can see.
    Command.withDescription("List the resources you can see: all of them with resources:manage, otherwise those shared with you"),
    Command.withAlias("list")
  )
