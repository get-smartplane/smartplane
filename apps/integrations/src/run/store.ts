import type { OrgId, ResourceId } from "@pc/domain"
import { Context, Layer, Option, Schema } from "effect"
import { WorkerBindings } from "../platform/env"

/** The Activepieces `context.store` surface. Pieces use it for small state, such as cursors. */
export interface PieceStore {
  readonly put: (key: string, value: unknown, scope?: string) => Promise<unknown>
  readonly get: (key: string, scope?: string) => Promise<unknown>
  readonly delete: (key: string, scope?: string) => Promise<void>
}

/** Values are JSON; larger ones are refused so one integration cannot fill the namespace. */
export const MaxStoreValueBytes = 64_000
const decodeStored = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Json))

/** Store data is isolated per org and integration resource: one org's piece state never reaches another's. */
export const storeKey = (orgId: OrgId, resourceId: ResourceId, scope: string | undefined, key: string): string =>
  `integration-store:${orgId}:${resourceId}:${scope ?? "COLLECTION"}:${key}`

interface Backend {
  readonly read: (key: string) => Promise<string | null>
  readonly write: (key: string, value: string) => Promise<void>
  readonly remove: (key: string) => Promise<void>
}

const storeOver = (backend: Backend) => (orgId: OrgId, resourceId: ResourceId): PieceStore => ({
  put: async (key, value, scope) => {
    const text = JSON.stringify(value ?? null)
    if (text.length > MaxStoreValueBytes) throw new Error(`store value for "${key}" exceeds ${MaxStoreValueBytes} bytes`)
    await backend.write(storeKey(orgId, resourceId, scope, key), text)
    return value
  },
  get: async (key, scope) => {
    const text = await backend.read(storeKey(orgId, resourceId, scope, key))
    return text === null ? null : Option.getOrNull(decodeStored(text))
  },
  delete: (key, scope) => backend.remove(storeKey(orgId, resourceId, scope, key))
})

export class ActionStore extends Context.Service<ActionStore, {
  readonly forResource: (orgId: OrgId, resourceId: ResourceId) => PieceStore
}>()("integrations/run/ActionStore") {
  static readonly layer = Layer.effect(
    ActionStore,
    WorkerBindings.useSync(({ STORE }) =>
      ActionStore.of({
        forResource: storeOver({
          read: (key) => STORE.get(key, "text"),
          write: (key, value) => STORE.put(key, value),
          remove: (key) => STORE.delete(key)
        })
      })
    )
  )

  /** For tests and local runs without KV. */
  static readonly memory = (entries = new Map<string, string>()) =>
    Layer.succeed(ActionStore, {
      forResource: storeOver({
        read: async (key) => entries.get(key) ?? null,
        write: async (key, value) => void entries.set(key, value),
        remove: async (key) => void entries.delete(key)
      })
    })
}
