import { type GrantSubject, RoleSlug } from "@pc/domain"
import { Effect, Schema } from "effect"
import type { Api } from "../api/client"
import { failure, usageFailure } from "../app/failure"
import { findMember, resolveTeam, resolveToken } from "./entities"

export const subjectHelp = "team:<slug>, user:<email>, role:<slug> or token:<service-account name|id>"

/** `team:platform`, `user:ana@acme.com`, `role:admin`, `token:deploy-bot` → the grant subject they name. */
export const resolveSubject = (api: Api, spec: string) =>
  Effect.gen(function*() {
    const separator = spec.indexOf(":")
    const kind = spec.slice(0, separator)
    const value = spec.slice(separator + 1)
    if (separator < 1 || value.length === 0) return yield* usageFailure(`Cannot read --to "${spec}".`, `Use ${subjectHelp}.`)
    switch (kind) {
      case "team":
        return { type: "team", id: yield* resolveTeam(api)(value) } satisfies GrantSubject
      case "user": {
        const member = yield* findMember(api)(value)
        if (member.userId === null) return yield* failure(`${member.email} has not accepted their invitation yet.`)
        if (member.status === "deprovisioned") return yield* failure(`${member.email} has been offboarded.`)
        return { type: "user", id: member.userId } satisfies GrantSubject
      }
      case "role": {
        if (!Schema.is(RoleSlug)(value)) return yield* usageFailure(`"${value}" is not a role slug.`)
        return { type: "role", role: value } satisfies GrantSubject
      }
      case "token":
      case "service-account":
        return { type: "service_account", id: yield* resolveToken(api, "all")(value) } satisfies GrantSubject
      default:
        return yield* usageFailure(`Unknown subject type "${kind}".`, `Use ${subjectHelp}.`)
    }
  })

/** The id a subject is filtered by in `grants ls --to`. */
export const subjectId = (subject: GrantSubject): string => (subject.type === "role" ? subject.role : subject.id)
