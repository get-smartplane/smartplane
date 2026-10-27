import { type CreateResourceConfig, Description, Name, Resource } from "@pc/domain"
import { Effect, Option } from "effect"
import { Flag } from "effect/cli"
import type { Api } from "../../../api/client"
import { projectFlag } from "../../../app/common-flags"
import { emit } from "../../../app/output"
import { resolveProject, resolveResource } from "../../../resolve/entities"
import { resourceDetails } from "../describe"

/** Flags every `resources add <kind>` takes. */
export const commonFlags = {
  name: Flag.String("name").pipe(Flag.withSchema(Name), Flag.withDescription("Resource name, unique in the org")),
  description: Flag.String("description").pipe(Flag.withSchema(Description), Flag.withDescription("What agents should use it for"), Flag.withDefault("")),
  project: projectFlag
}

export interface CommonInput {
  readonly name: string
  readonly description: string
  readonly project: Option.Option<string>
}

/** A `--*-secret` flag: the name or id of a `secret` resource holding a credential. */
export const secretRef = (name: string, description: string) => Flag.String(name).pipe(Flag.withDescription(`${description} (secret resource name or id)`))

/** Resolves an optional secret reference to its resource id. */
export const optionalSecret = (client: Api, ref: Option.Option<string>) => Effect.transposeOption(Option.map(ref, resolveResource(client)))

export const createResource = (client: Api, common: CommonInput, config: CreateResourceConfig) =>
  Effect.gen(function*() {
    const projectId = yield* Effect.transposeOption(Option.map(common.project, resolveProject(client)))
    const resource = yield* client.resources.create({
      payload: { name: common.name, description: common.description, projectId: Option.getOrNull(projectId), config }
    })
    yield* emit(Resource, resource, resourceDetails)
    return resource
  })
