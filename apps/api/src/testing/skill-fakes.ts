import { type InlineSkillConfig, type Principal, ProjectId, type Resource } from "@pc/domain"
import { DateTime, Effect, Layer } from "effect"
import { AccessPolicy } from "../access/access-policy"
import { resolveAccess } from "../access/resolution"
import { SkillGateway } from "../mcp/skills/skill-gateway"
import { now, userPrincipal } from "./fixtures"
import { grantOn } from "./skill-grants"
import { skillContent } from "./skill-content"
import { type Recorded, recordingAudit, resourceOf } from "./gateway-fakes"

export const projectA = ProjectId.make("prj_projecta01")
const projectB = ProjectId.make("prj_projectb01")

const skill = (id: string, name: string, extra: Partial<Resource> = {}, args?: InlineSkillConfig["arguments"]): Resource => ({
  ...resourceOf(id, name, { kind: "skill", description: `${name} description`, body: "Notes for {{version}}{{tone}}.", ...(args ? { arguments: args } : {}) }),
  ...extra
})

export const releaseNotes = skill("res_skillnotes1", "Release notes", {}, [{ name: "version", required: true }, { name: "tone", description: "Voice" }])
export const inProject = skill("res_skillproja1", "Project A playbook", { projectId: projectA })
const otherProject = skill("res_skillprojb1", "Project B playbook", { projectId: projectB })
const expired = skill("res_skillexpd01", "Expired skill")
const ungranted = skill("res_skillnone01", "Ungranted skill")
const variable = resourceOf("res_variable01", "Region", { kind: "variable", value: "eu" })

const grant = grantOn

const grants = [
  grant(releaseNotes, "read"),
  grant(inProject, "use"),
  grant(otherProject, "admin"),
  grant(expired, "read", { expiresAt: DateTime.subtract(now, { hours: 1 }) }),
  grant(variable, "read")
]
const resources = [releaseNotes, inProject, otherProject, expired, ungranted, variable]

/** Real grant resolution (expiry, project scope) over fixed grants, so tests exercise the live rules. */
const policy = Layer.succeed(AccessPolicy, {
  resolve: (principal: Principal) => Effect.succeed(resolveAccess(principal, grants, resources, now))
})

/** A user scoped to project A, holding grants on every fixture skill except `ungranted`. */
export const skillCaller = userPrincipal({ projectId: projectA })

export const skillGatewayWith = (events: Array<Recorded>) =>
  SkillGateway.layer.pipe(Layer.provide([policy, recordingAudit(events), skillContent()]))
