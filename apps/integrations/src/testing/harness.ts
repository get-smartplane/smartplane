import { type IntegrationAction, OrgId, PieceId, ResourceId } from "@pc/domain"
import { pieceLoaders as businessPieces } from "@pc/integrations/generated/pieces/business"
import { pieceLoaders as corePieces } from "@pc/integrations/generated/pieces/core"
import { type RunAuth, type RunRequest, UnknownAction } from "@pc/integrations/rpc"
import { Effect, Layer, Redacted } from "effect"
import { CatalogIndex } from "../run/catalog-index"
import { PieceLoader } from "../run/piece-loader"
import { PieceRunner } from "../run/runner"
import { ActionStore } from "../run/store"

export const orgId = OrgId.make("org_testorg01")
export const resourceId = ResourceId.make("res_integration1")

export const secretAuth = (secret: string): RunAuth => ({ type: "secret_text", secret: Redacted.make(secret) })

export const request = (pieceId: string, actionName: string, props: RunRequest["props"], auth: RunAuth = { type: "none" }): RunRequest => ({
  orgId,
  resourceId,
  pieceId: PieceId.make(pieceId),
  actionName,
  auth,
  props
})

/** A catalog entry for a fake action: supported, with the given input schema. */
export const entry = (name: string, inputSchema: IntegrationAction["inputSchema"]): IntegrationAction => ({
  name,
  displayName: name,
  description: "",
  audience: "ai",
  classification: "read",
  idempotent: true,
  requiredAction: "use",
  inputSchema,
  dynamicInputs: [],
  support: { status: "supported" }
})

export const fakeCatalog = (entries: Readonly<Record<string, IntegrationAction>>) =>
  Layer.succeed(CatalogIndex, {
    runnable: (pieceId, actionName) => {
      const found = entries[`${pieceId}/${actionName}`]
      return found === undefined ? Effect.fail(new UnknownAction({ pieceId, actionName })) : Effect.succeed(found)
    }
  })

/** A piece module shaped like an Activepieces package export. */
export const fakePieceModule = (actions: Readonly<Record<string, { readonly props: Readonly<Record<string, unknown>>; readonly run: (context: unknown) => unknown }>>) => ({
  fake: {
    displayName: "Fake",
    logoUrl: "https://example.com/logo.svg",
    actions: () =>
      Object.fromEntries(Object.entries(actions).map(([name, action]) => [name, { name, displayName: name, description: "", ...action }]))
  }
})

export const runnerWith = (catalog: Layer.Layer<CatalogIndex>, loaders: Readonly<Record<string, () => Promise<unknown>>>, store = new Map<string, string>()) =>
  PieceRunner.layer.pipe(Layer.provide(Layer.mergeAll(catalog, PieceLoader.make(loaders), ActionStore.memory(store))))

/** Reads `context.a.b...` the way a piece would, without trusting the shape. */
export const pick = (value: unknown, ...path: ReadonlyArray<string>): unknown =>
  path.reduce<unknown>((current, key) => (typeof current === "object" && current !== null && key in current ? Reflect.get(current, key) : undefined), value)

/** Calls `context.store.<method>(...args)` as a piece would. */
export const callStore = (context: unknown, method: "get" | "put", ...args: ReadonlyArray<unknown>): Promise<unknown> => {
  const fn = pick(context, "store", method)
  return typeof fn === "function" ? Promise.resolve(Reflect.apply(fn, pick(context, "store"), args)) : Promise.reject(new Error("no store"))
}

export const run = (input: RunRequest) => PieceRunner.use((runner) => runner.run(input))

/** The real catalog and every shard's real pieces in one runner, with an in-memory store. */
export const realPieces = PieceRunner.layer.pipe(
  Layer.provide(Layer.mergeAll(CatalogIndex.all, PieceLoader.make({ ...corePieces, ...businessPieces }), ActionStore.memory()))
)

/** An OAuth2 connection as apps/api sends it: access token, token response fields and the connection's props. */
export const oauthAuth = (accessToken: string, props: Readonly<Record<string, string>> = {}, data: Readonly<Record<string, string>> = {}): RunAuth => ({
  type: "oauth2",
  accessToken: Redacted.make(accessToken),
  tokenType: "Bearer",
  scope: "",
  data: Redacted.make(data),
  props
})

export const customAuth = (props: Readonly<Record<string, string>>): RunAuth => ({ type: "custom", props: Redacted.make(props) })
