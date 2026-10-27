import type { BuiltinSkillSummary } from "@pc/domain"
import { Effect } from "effect"
import { builtinSkills, builtinVersion } from "./builtin-skills"

/** `GET /api/skills/builtin`: what the dashboard lists as "Built-in", at the same version MCP serves. */
export const builtinSummaries: Effect.Effect<ReadonlyArray<BuiltinSkillSummary>> = Effect.forEach(builtinSkills, (skill) =>
  Effect.map(builtinVersion(skill), (version) => ({ slug: skill.slug, description: skill.description, version, builtin: true as const })))
