import type { RunRequest } from "@pc/integrations/rpc"
import { UnsupportedAction } from "@pc/integrations/rpc"
import { connectionValue } from "./auth-value"
import type { PieceStore } from "./store"

export interface ContextInput {
  readonly request: RunRequest
  readonly propsValue: Readonly<Record<string, unknown>>
  readonly store: PieceStore
  readonly runId: string
}

const describeFile = (fileName: unknown, data: unknown): string =>
  `${String(fileName)} (${ArrayBuffer.isView(data) ? `${data.byteLength} bytes` : "unknown size"}; Smartplane does not store files)`

/**
 * A minimal Activepieces `ActionContext`. Smartplane provides what an action needs to call its provider:
 * credentials, validated props, a store scoped to this org and integration, and no-op flow hooks. Anything
 * that only exists inside an Activepieces deployment fails with `UnsupportedAction` when touched.
 */
export const actionContext = ({ request, propsValue, store, runId }: ContextInput): Readonly<Record<string, unknown>> => {
  const unavailable = (member: string) => (): never => {
    throw new UnsupportedAction({
      pieceId: request.pieceId,
      actionName: request.actionName,
      reason: `the action uses context.${member}, which exists only inside Activepieces`
    })
  }
  return {
    executionType: "BEGIN",
    auth: connectionValue(request.auth),
    propsValue,
    store,
    project: { id: request.resourceId, externalId: async () => undefined },
    step: { name: request.actionName },
    flows: { current: { id: request.resourceId, version: { id: request.resourceId } }, list: unavailable("flows.list") },
    connections: { get: unavailable("connections.get") },
    tags: { add: async () => undefined },
    output: { update: async () => undefined },
    files: { write: async ({ fileName, data }: { fileName: unknown; data: unknown }) => describeFile(fileName, data) },
    agent: { tools: unavailable("agent.tools") },
    server: {
      get apiUrl() {
        return unavailable("server")()
      },
      get publicUrl() {
        return unavailable("server")()
      },
      get token() {
        return unavailable("server")()
      }
    },
    run: {
      id: runId,
      stop: () => undefined,
      respond: () => undefined,
      pause: unavailable("run.pause"),
      createWaitpoint: unavailable("run.createWaitpoint"),
      waitForWaitpoint: unavailable("run.waitForWaitpoint")
    },
    generateResumeUrl: unavailable("generateResumeUrl")
  }
}
