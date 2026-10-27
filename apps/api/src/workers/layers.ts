import { Layer } from "effect"
import { FetchHttpClient } from "effect/http"
import { AccessPolicy } from "../access/access-policy"
import { Approvals } from "../access/approvals"
import { ApprovalsRepo } from "../access/approvals-repo"
import { Grants } from "../access/grants"
import { GrantsRepo } from "../access/grants-repo"
import { TokenAuthenticator } from "../access/token-auth"
import { Tokens } from "../access/tokens"
import { TokensRepo } from "../access/tokens-repo"
import { AuditLog } from "../audit/audit-log"
import { AuditReader } from "../audit/audit-reader"
import { AuditArchiveCursors } from "../audit/archive-cursors"
import { AuditRetentionStore } from "../audit/retention-store"
import { AuditStore } from "../audit/store"
import { AuthenticationLive, SessionAuthenticationLive } from "../auth/middleware"
import { Principals } from "../auth/principals"
import { SignIn } from "../auth/sign-in"
import { UsersRepo } from "../auth/users-repo"
import { WorkOS } from "../auth/workos"
import { DeliveryGuards } from "../delivery/delivery-guards"
import { DeliverySettings } from "../delivery/delivery-settings"
import { MachineTokenAuthenticator } from "../delivery/machine-token-auth"
import { MachineTokens } from "../delivery/machine-tokens"
import { MachineTokensRepo } from "../delivery/machine-tokens-repo"
import { DeliveryAuthenticationLive } from "../delivery/middleware"
import { RateLimiter } from "../delivery/rate-limiter"
import { SecretDelivery } from "../delivery/secret-delivery"
import { Classifier } from "../guards/classifier"
import { GuardCompiler } from "../guards/compiler"
import { GuardEvaluator } from "../guards/evaluator"
import { ExampleCalls } from "../guards/examples/example-calls"
import { GuardToolDocs } from "../guards/grounding/tool-docs"
import { Guards } from "../guards/guards"
import { GuardStarters } from "../guards/starters/starters"
import { GuardsRepo } from "../guards/guards-repo"
import { GuardTestCalls } from "../guards/test-calls"
import { GuardVerifier } from "../guards/verify"
import { PinChildren } from "../guards/pinning/children-store"
import { PinLookup } from "../guards/pinning/lookup"
import { GuardPins } from "../guards/pinning/pins"
import { VerifyJobs } from "../guards/verify-job/job"
import { VerifyPrincipals } from "../guards/verify-job/requester"
import { VerifyRunner } from "../guards/verify-job/runner"
import { VerifyRuns } from "../guards/verify-job/runs"
import { ToolProvidersLive } from "../gateway-tools/live"
import { ToolCatalog } from "../mcp/catalog"
import { GatewayReads } from "../mcp/gateway-reads"
import { ToolPipeline } from "../mcp/pipeline"
import { Lookup } from "../lookup/lookup"
import { LookupRepo } from "../lookup/lookup-repo"
import { IntegrationCatalog } from "../integrations/catalog"
import { IntegrationCredentials } from "../integrations/credentials"
import { OAuthCallback } from "../integrations/oauth/callback"
import { IntegrationOAuth } from "../integrations/oauth/flow"
import { OAuthStates } from "../integrations/oauth/state-store"
import { TokenEndpoint } from "../integrations/oauth/token-endpoint"
import { OAuthTokens } from "../integrations/oauth/tokens"
import { IntegrationRunner } from "../integrations/runner"
import { McpGatewayLive } from "../mcp/live"
import { Upstream } from "../mcp/upstream"
import { UpstreamClient } from "../mcp/upstream-client"
import { OAuthAuthenticator } from "../oauth/authenticator"
import { AuthKitKeys } from "../oauth/jwks"
import { Connections } from "../connections/connections"
import { McpCatalog } from "../mcp-catalog/mcp-catalog"
import { ResourceToolList } from "../resources/resource-tools"
import { ConnectionsRepo } from "../connections/connections-repo"
import { ConnectionsCoreLive } from "../connections/live"
import { ConnectionKeysRepo } from "../connections/wrapped-keys"
import { AccessTokenVerifier } from "../oauth/verifier"
import { InvitationAcceptance } from "../org/invitation-acceptance"
import { Invitations } from "../org/invitations"
import { InviteAccessRepo } from "../org/invite-access-repo"
import { Members } from "../org/members"
import { MembersRepo } from "../org/members-repo"
import { Offboarding } from "../org/offboarding"
import { Onboarding } from "../org/onboarding"
import { OnboardingRepo } from "../org/onboarding-repo"
import { OrgsRepo } from "../org/orgs-repo"
import { Projects } from "../org/projects"
import { ProjectsRepo } from "../org/projects-repo"
import { Roles } from "../org/roles"
import { RolesRepo } from "../org/roles-repo"
import { SetupProgress } from "../org/setup-progress"
import { Teams } from "../org/teams"
import { TeamsRepo } from "../org/teams-repo"
import { WorkersAi } from "../platform/ai"
import { AuditArchive } from "../platform/archive"
import { AuditLogClient } from "../platform/audit-log-client"
import { AuditQueue } from "../platform/audit-queue"
import { WorkerBindings, type WorkerEnv } from "../platform/bindings"
import { AppConfig } from "../platform/config"
import { DatabaseLive } from "../platform/database"
import { KvCache } from "../platform/kv"
import { SingleUseStore } from "../platform/single-use-states"
import { ResourceVisibility } from "../resources/resource-visibility"
import { Resources } from "../resources/resources"
import { ResourcesRepo } from "../resources/resources-repo"
import { AccessReviewsLive } from "../reviews/live"
import { AccessReviewsRepo } from "../reviews/reviews-repo"
import { KeyRotation } from "../secrets/key-rotation"
import { KeyRing } from "../secrets/key-ring"
import { SecretStatuses } from "../secrets/secret-statuses"
import { Secrets } from "../secrets/secrets"
import { SecretVersionsRepo } from "../secrets/versions-repo"
import { WrappedKeysRepo } from "../secrets/wrapped-keys-repo"
import { OrgSettings } from "../settings/org-settings"
import { WorkosAdmin } from "../settings/workos-admin"
import { SkillsApiLive, SkillsCoreLive } from "../skills/live"
import { SkillScanQueue } from "../skills/scan/queue"
import { SkillBlobs } from "../skills/storage/blobs"
import { SkillPolicyRepo } from "../skills/storage/policy-repo"
import { SkillVersionsRepo } from "../skills/storage/versions-repo"
import { Provisioning } from "../webhooks/provisioning"

/** Bindings wrapped as services; nothing above this layer touches `env`. */
const platform = (env: WorkerEnv) =>
  Layer.mergeAll(DatabaseLive, KvCache.layer, WorkersAi.layer, AuditArchive.layer, AuditQueue.layer.pipe(Layer.provideMerge(AuditLogClient.layer)), FetchHttpClient.layer, SkillBlobs.layer, SkillScanQueue.layer, RateLimiter.layer).pipe(
    Layer.provideMerge(Layer.mergeAll(Layer.succeed(WorkerBindings, env), AppConfig.fromEnv(env)))
  )

const repositories = Layer.mergeAll(
  OrgsRepo.layer,
  UsersRepo.layer,
  MembersRepo.layer,
  RolesRepo.layer,
  TeamsRepo.layer,
  ProjectsRepo.layer,
  ResourcesRepo.layer,
  SecretVersionsRepo.layer,
  GrantsRepo.layer,
  TokensRepo.layer,
  ApprovalsRepo.layer,
  GuardsRepo.layer,
  AuditStore.layer,
  AuditRetentionStore.layer, AuditArchiveCursors.layer,
  WrappedKeysRepo.layer,
  AccessReviewsRepo.layer,
  LookupRepo.layer,
  SkillVersionsRepo.layer,
  SkillPolicyRepo.layer,
  ConnectionsRepo.layer,
  ConnectionKeysRepo.layer,
  SingleUseStore.layer,
  OnboardingRepo.layer,
  InviteAccessRepo.layer,
  MachineTokensRepo.layer
)

const foundations = Layer.mergeAll(
  repositories,
  AuditLog.layer,
  KeyRing.layer,
  WorkOS.layer,
  Classifier.layer,
  GuardCompiler.layer,
  AuthKitKeys.layer,
  WorkosAdmin.layer,
  IntegrationCatalog.layer,
  TokenEndpoint.layer,
  PinChildren.layer,
  VerifyJobs.layer
)

const core = Layer.mergeAll(
  Secrets.layer,
  Principals.layer,
  Offboarding.layer,
  AccessPolicy.layer,
  Approvals.layer,
  SignIn.layer.pipe(Layer.provide(InvitationAcceptance.layer)),
  InvitationAcceptance.layer,
  AccessTokenVerifier.layer,
  MachineTokenAuthenticator.layer,
  DeliveryGuards.layer,
  OAuthStates.layer,
  SkillsCoreLive
)

/** Activepieces integrations: credentials for runs, the OAuth2 connection flow, and the shard-routed runner client. */
const integrations = Layer.mergeAll(IntegrationCredentials.layer, IntegrationOAuth.layer, OAuthCallback.layer, IntegrationRunner.layer).pipe(
  Layer.provideMerge(OAuthTokens.layer)
)

const upstreamLive = Upstream.layer.pipe(Layer.provide(UpstreamClient.layer))

/** Verify grounded in the systems a rule names: their tools (listed through `Upstream`), generated example calls, the self-test. */
/**
 * Read-only tool calls on an admin's behalf (pin lookups) through the same catalog and pipeline agents use,
 * so they are grant-checked, guard-checked and audited like any call.
 */
const gatewayReads = GatewayReads.layer.pipe(
  Layer.provide(Layer.mergeAll(ToolCatalog.layer.pipe(Layer.provide(ToolProvidersLive)), ToolPipeline.layer.pipe(Layer.provide(GuardEvaluator.layer)))),
  Layer.provide(Layer.mergeAll(integrations, upstreamLive))
)

const guardVerification = Layer.mergeAll(GuardTestCalls.layer, VerifyRunner.layer, GuardPins.layer).pipe(
  Layer.provideMerge(Layer.mergeAll(VerifyRuns.layer, GuardVerifier.layer)),
  Layer.provideMerge(Layer.mergeAll(GuardToolDocs.layer, ExampleCalls.layer, PinLookup.layer.pipe(Layer.provide(gatewayReads)), VerifyPrincipals.layer)),
  Layer.provide(upstreamLive)
)

const features = Layer.mergeAll(
  integrations,
  TokenAuthenticator.layer,
  OAuthAuthenticator.layer,
  upstreamLive,
  GuardEvaluator.layer,
  SecretDelivery.layer,
  DeliverySettings.layer,
  MachineTokens.layer,
  Tokens.layer,
  Grants.layer,
  Resources.layer,
  Members.layer,
  Invitations.layer,
  Onboarding.layer,
  SetupProgress.layer,
  Roles.layer,
  Teams.layer,
  Projects.layer,
  Guards.layer.pipe(Layer.provideMerge(guardVerification)),
  GuardStarters.layer,
  AuditReader.layer,
  Provisioning.layer,
  OrgSettings.layer,
  KeyRotation.layer,
  SecretStatuses.layer,
  AccessReviewsLive,
  Lookup.layer
).pipe(Layer.provideMerge(ResourceVisibility.layer))

const edge = Layer.mergeAll(McpGatewayLive, AuthenticationLive, SessionAuthenticationLive, DeliveryAuthenticationLive, SkillsApiLive, Connections.layer, McpCatalog.layer, ResourceToolList.layer)

/** Every service of the Worker, built once per isolate and shared by fetch, queue and cron. */
export const appServices = (env: WorkerEnv) =>
  edge.pipe(
    Layer.provideMerge(features),
    Layer.provideMerge(ConnectionsCoreLive),
    Layer.provideMerge(core),
    Layer.provideMerge(foundations),
    Layer.provideMerge(platform(env))
  )
