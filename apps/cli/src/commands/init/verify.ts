import type { Me, ProjectId } from "@pc/domain"
import { Effect, Option, Schema } from "effect"
import type { Session } from "../../api/session"
import { type AppError, toFailure } from "../../app/describe-error"
import { CliFailure, failure } from "../../app/failure"
import { note } from "../../app/output"
import { fetchDelivery } from "../../delivery/fetch"
import { McpConnection } from "../../skills/mcp"
import { step, type Step, type VerifyReport } from "./report"

const ToolList = Schema.Struct({ tools: Schema.Array(Schema.Struct({ name: Schema.String })) })

/** Gateway tools are `<server>__<tool>`; the built-ins (`skills_list`, ...) are served to everyone. */
const isGatewayTool = (name: string) => name.includes("__")

const why = (error: AppError) => toFailure(error).message

/** Lists tools over MCP as this user, the way an agent will see them (audited like any listing). */
const countTools = (session: Session, projectId: Option.Option<ProjectId>) =>
  Effect.scoped(Effect.gen(function*() {
    const mcp = yield* (yield* McpConnection).open(`${session.apiUrl}/mcp`, session.token, Option.match(projectId, { onNone: () => ({}), onSome: (id) => ({ projectId: id }) }))
    const listed = yield* Effect.tryPromise({ try: () => mcp.listTools(), catch: (cause) => (cause instanceof CliFailure ? cause : failure(String(cause))) })
    const { tools } = yield* Schema.decodeUnknownEffect(ToolList)(listed)
    return { tools: tools.filter((tool) => isGatewayTool(tool.name)).length, builtinTools: tools.filter((tool) => !isGatewayTool(tool.name)).length }
  }))

/**
 * Checks the setup from the agent's side: how many tools the gateway offers this user, and which env names
 * `smartplane run` would inject here (names only, as `run --dry-run` shows them).
 */
export const verifySetup = (session: Session, me: Me, projectId: Option.Option<ProjectId>) =>
  Effect.gen(function*() {
    const problems: Array<string> = []
    const tools = yield* countTools(session, projectId).pipe(Effect.catch((error) => Effect.as(Effect.sync(() => problems.push(`MCP: ${why(error)}`)), { tools: 0, builtinTools: 0 })))
    const delivered = me.principal._tag === "User"
      ? yield* fetchDelivery({ purpose: "run", project: Option.none(), only: Option.none(), placeholders: false }).pipe(
        Effect.map((plan) => plan.injected.map((item) => item.name)),
        Effect.catch((error) => Effect.as(Effect.sync(() => problems.push(`delivery: ${why(error)}`)), []))
      )
      : []
    const report: VerifyReport = { ...tools, delivered, problems }
    yield* note(tools.tools === 0 ? "= No gateway tools yet." : `✓ ${tools.tools} tool${tools.tools === 1 ? "" : "s"} available to you.`)
    yield* note(delivered.length === 0 ? "= smartplane run would inject nothing yet." : `✓ smartplane run would inject: ${delivered.join(", ")}`)
    return { report, step: verifyStep(report, session.apiUrl) }
  })

const verifyStep = (report: VerifyReport, apiUrl: string): Step => {
  if (report.problems.length > 0) return step("verify", "failed", report.problems.join("; "))
  const tools = report.tools === 0
    ? `no tools yet: ask an admin for access, or add one at ${apiUrl}/resources`
    : `${report.tools} tool${report.tools === 1 ? "" : "s"} available to you`
  const run = report.delivered.length === 0 ? "smartplane run injects nothing yet" : `smartplane run injects ${report.delivered.join(", ")}`
  return step("verify", "done", `${tools}; ${run}`)
}
