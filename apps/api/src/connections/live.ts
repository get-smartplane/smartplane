import { Layer } from "effect"
import { AccountModes } from "./account-mode"
import { ConnectionCallback } from "./oauth/callback"
import { McpOAuthDiscovery } from "./oauth/discovery"
import { PendingConnections } from "./oauth/pending"
import { McpClientRegistration } from "./oauth/registration"
import { ConnectionOAuth } from "./oauth/start"
import { ConnectionResolver } from "./resolver"
import { ConnectionTokens } from "./tokens"
import { ConnectionVault } from "./vault"

/** Connected accounts for the gateway (resolver), the OAuth sign-in (start and callback) and token refresh. */
export const ConnectionsCoreLive = Layer.mergeAll(ConnectionResolver.layer, ConnectionCallback.layer, ConnectionOAuth.layer, AccountModes.layer).pipe(
  Layer.provideMerge(ConnectionTokens.layer),
  Layer.provideMerge(Layer.mergeAll(ConnectionVault.layer, PendingConnections.layer, McpOAuthDiscovery.layer, McpClientRegistration.layer))
)
