import { assert, describe, it } from "@effect/vitest"
import { GuardId } from "@pc/domain"
import { Effect, Layer, Option } from "effect"
import { Approvals } from "../access/approvals"
import { fakeTeams } from "../testing/connection-fakes"
import { now, orgId, userId, userPrincipal } from "../testing/fixtures"
import { memoryPinChildren, resourceOf } from "../testing/gateway-fakes"
import { Classifier } from "./classifier"
import { GuardEvaluator } from "./evaluator"
import { GuardsRepo } from "./guards-repo"

const notion = { ...resourceOf("res_notion0001", "Notion", { kind: "mcp_server", url: "https://mcp.notion.com/mcp", transport: "streamable_http" }), orgId }
const guard = {
  id: GuardId.make("grd_todolist01"),
  orgId,
  projectId: null,
  resourceIds: [],
  name: "todo",
  nameFollowsRule: false,
  modeFollowsRule: false,
  applies: null,
  approvers: [],
  rule: "nobody can update todo list in notion",
  mode: "enforce" as const,
  threshold: 0.5,
  status: "active" as const,
  compiled: { instructions: "Does this call change the Notion to-do list?", examples: [] },
  compiledVersion: 1,
  testCalls: [],
  pins: [],
  verify: null,
  createdBy: userId,
  createdAt: now,
  updatedAt: null
}

describe("GuardEvaluator state", () => {
  it.effect("tells the classifier what the tool does and redacts credentials from its arguments", () => {
    const states: Array<unknown> = []
    const layer = GuardEvaluator.layer.pipe(
      Layer.provide(memoryPinChildren()),
      Layer.provide(fakeTeams([])),
      Layer.provide(Layer.succeed(GuardsRepo, { list: () => Effect.succeed([]), active: () => Effect.succeed([guard]), find: () => Effect.succeed(Option.none()), insert: () => Effect.void, save: () => Effect.void, setRun: () => Effect.succeed(false), saveForRun: () => Effect.succeed(false) })),
      Layer.provide(Layer.succeed(Classifier, { classify: (state, questions) => Effect.sync(() => (states.push(state), new Map([...questions.keys()].map((id) => [id, 0.1])))) })),
      Layer.provide(Layer.succeed(Approvals, { listPending: () => Effect.die("unused"), decide: () => Effect.die("unused"), request: () => Effect.die("unused") }))
    )
    return Effect.gen(function*() {
      yield* GuardEvaluator.use((evaluator) =>
        evaluator.evaluate(userPrincipal(), {
          resource: notion,
          tool: "notion-update-page",
          arguments: { page_id: "1f2e", properties: { Done: "__YES__" }, token: "secret-token-value" },
          toolInfo: { gatewayName: "notion__notion-update-page", title: "Update page", description: "[Notion] Update a Notion page's properties or content." }
        })
      )
      const state = JSON.stringify(states[0])
      assert.include(state, "\"product\":\"Notion\"")
      assert.include(state, "\"toolTitle\":\"Update page\"")
      assert.include(state, "\"toolDescription\":\"[Notion] Update a Notion page's properties or content.\"")
      assert.include(state, "\"properties\":{\"Done\":\"__YES__\"}")
      assert.notInclude(state, "secret-token-value")
    }).pipe(Effect.provide(layer))
  })
})
