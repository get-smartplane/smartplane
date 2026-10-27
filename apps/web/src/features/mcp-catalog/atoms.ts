import type { AccountMode, OAuthReturnTo, ResourceId } from "@pc/domain"
import type { Redacted } from "effect"
import { Atom } from "effect/reactivity"
import { apiMutation, apiQuery } from "@/lib/api/atoms"

/** The official servers, each with this org's copies of it and how they stand. */
export const mcpCatalogAtom = apiQuery(["resources", "connections"], (api) => api.mcpCatalog.list())

export interface ConnectCatalogInput {
  readonly slug: string
  readonly accountMode: AccountMode
  readonly returnTo?: OAuthReturnTo
  readonly token?: Redacted.Redacted<string>
}

/** Creates the server (so resources refresh); a shared sign-in then continues at the provider. */
export const connectCatalogAtom = apiMutation(["resources", "connections", "grants"], (api, { slug, ...payload }: ConnectCatalogInput) =>
  api.mcpCatalog.connect({ params: { slug }, payload })
)

/** An MCP server's tools with read/write hints; refreshes when its account changes. */
export const resourceToolsAtom = Atom.family((id: ResourceId) => apiQuery(["connections", "resources"], (api) => api.resources.tools({ params: { id } })))
