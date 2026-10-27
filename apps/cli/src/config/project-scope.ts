import { ProjectId } from "@pc/domain"
import { Effect, Option, Schema } from "effect"
import { api } from "../api/client"
import { currentSession, DefaultApiUrl } from "../api/session"
import { usageFailure } from "../app/failure"
import { note } from "../app/output"
import { isMachineToken } from "../delivery/client"
import { resolveProject } from "../resolve/entities"
import { readProjectConfig } from "./project-config"

/** A machine token may call only the delivery endpoint, so a project must be given by id, not looked up by name. */
export const projectIdFor = (project: string) =>
  Effect.gen(function*() {
    if (Schema.is(ProjectId)(project)) return project
    if (isMachineToken(yield* currentSession)) {
      return yield* usageFailure(`A machine token cannot look up the project "${project}" by name.`, "Pass the project id (prj_…).")
    }
    return yield* resolveProject(yield* api)(project)
  })

/**
 * The project a command works in: `--project` when given, else `.smartplane/project.json` when it was written
 * for the Smartplane this command talks to (a file for another instance is ignored, with a note).
 */
export const projectScope = (flag: Option.Option<string>) =>
  Effect.gen(function*() {
    if (Option.isSome(flag)) return Option.some(yield* projectIdFor(flag.value))
    const config = yield* readProjectConfig
    if (Option.isNone(config)) return Option.none<ProjectId>()
    const { apiUrl } = yield* currentSession
    if ((config.value.apiUrl ?? DefaultApiUrl) !== apiUrl) {
      yield* note(`smartplane: ignoring .smartplane/project.json: it is for ${config.value.apiUrl ?? DefaultApiUrl}, not ${apiUrl}.`)
      return Option.none<ProjectId>()
    }
    return Option.some(config.value.projectId)
  })
