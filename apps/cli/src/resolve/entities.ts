import {
  AccessTokenId,
  GuardId,
  type Member,
  ProjectId,
  ResourceId,
  TeamId,
  type AccessToken,
  type Guard,
  type Project,
  type Resource,
  type Team
} from "@pc/domain"
import { Effect, Schema } from "effect"
import type { Api } from "../api/client"
import { kindLabel } from "../commands/resources/kinds"
import { type Naming, pick } from "./pick"

export const resourceNaming: Naming<Resource, ResourceId> = {
  entity: "resource",
  id: (resource) => resource.id,
  names: (resource) => [resource.name],
  label: (resource) => `${resource.name} (${kindLabel(resource.config.kind)})`
}

export const teamNaming: Naming<Team, TeamId> = {
  entity: "team",
  id: (team) => team.id,
  names: (team) => [team.slug, team.name],
  label: (team) => team.slug
}

export const memberNaming: Naming<Member, string> = {
  entity: "member",
  id: (member) => member.id,
  names: (member) => [member.email],
  label: (member) => `${member.email} (${member.status})`
}

export const tokenNaming: Naming<AccessToken, AccessTokenId> = {
  entity: "token",
  id: (token) => token.id,
  names: (token) => [token.name, token.prefix],
  label: (token) => `${token.name} (${token.prefix}…)`
}

export const guardNaming: Naming<Guard, GuardId> = {
  entity: "rule",
  id: (guard) => guard.id,
  names: (guard) => [guard.name],
  label: (guard) => guard.name
}

export const projectNaming: Naming<Project, ProjectId> = {
  entity: "project",
  id: (project) => project.id,
  names: (project) => [project.slug, project.name],
  label: (project) => project.slug
}

/** An id is used as is (the API reports a wrong one); anything else is looked up by name. */
const byIdOrName = <A, I extends string, E>(
  idSchema: Schema.Codec<I, string>,
  naming: Naming<A, I>,
  list: Effect.Effect<ReadonlyArray<A>, E>
) =>
(query: string) => (Schema.is(idSchema)(query) ? Effect.succeed(query) : Effect.flatMap(list, (items) => Effect.map(pick(naming, query, items), naming.id)))

export const resolveResource = (api: Api) => byIdOrName(ResourceId, resourceNaming, api.resources.list({ query: {} }))
export const resolveTeam = (api: Api) => byIdOrName(TeamId, teamNaming, api.teams.list())
export const resolveToken = (api: Api, scope: "mine" | "all") =>
  byIdOrName(AccessTokenId, tokenNaming, api.tokens.list({ query: { scope } }))
export const resolveGuard = (api: Api) => byIdOrName(GuardId, guardNaming, api.guards.list())
export const resolveProject = (api: Api) => byIdOrName(ProjectId, projectNaming, api.projects.list({ query: {} }))

/** Members by email or membership id; deprovisioned members stay listed so their history resolves. */
export const findMember = (api: Api) => (query: string) =>
  Effect.flatMap(api.members.list(), (members) => pick(memberNaming, query, members))
