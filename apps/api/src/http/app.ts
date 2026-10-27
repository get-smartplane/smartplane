import { PrimitiveApi } from "@pc/domain"
import { Layer } from "effect"
import { HttpRouter, HttpServer } from "effect/http"
import { HttpApiBuilder } from "effect/http-api"
import { AuthRoutes } from "../auth/routes"
import { ConnectionOAuthRoutes } from "../connections/oauth/route"
import { IntegrationOAuthRoutes } from "../integrations/oauth/route"
import { McpRoutes } from "../mcp/route"
import { OAuthMetadataRoutes } from "../oauth/routes"
import { AppConfig } from "../platform/config"
import { WebhookRoutes } from "../webhooks/route"
import { SecurityHeaders } from "./security-headers"
import { AccessReviewsHandlers } from "./handlers/access-reviews"
import { ApprovalsHandlers } from "./handlers/approvals"
import { AuditHandlers } from "./handlers/audit"
import { GrantsHandlers } from "./handlers/grants"
import { GuardsHandlers } from "./handlers/guards"
import { ConnectionsHandlers } from "./handlers/connections"
import { IntegrationsHandlers } from "./handlers/integrations"
import { LookupHandlers } from "./handlers/lookup"
import { MachineTokensHandlers } from "./handlers/machine-tokens"
import { McpCatalogHandlers } from "./handlers/mcp-catalog"
import { MeHandlers } from "./handlers/me"
import { MembersHandlers } from "./handlers/members"
import { OnboardingHandlers } from "./handlers/onboarding"
import { OnboardingProgressHandlers } from "./handlers/onboarding-progress"
import { OrgHandlers } from "./handlers/org"
import { ProjectsHandlers } from "./handlers/projects"
import { ResourcesHandlers } from "./handlers/resources"
import { RolesHandlers } from "./handlers/roles"
import { ResourceDeliveryHandlers, SecretDeliveryHandlers } from "./handlers/secret-delivery"
import { SecretsHandlers } from "./handlers/secrets"
import { SkillsHandlers } from "./handlers/skills"
import { TeamsHandlers } from "./handlers/teams"
import { TokensHandlers } from "./handlers/tokens"
import { HealthRoute } from "./health"

/** /api/*: the PrimitiveApi contract from @pc/domain, with thin handlers over services. */
const ApiRoutes = HttpApiBuilder.layer(PrimitiveApi, { openapiPath: "/api/openapi.json" }).pipe(
  Layer.provide([
    MeHandlers,
    OnboardingHandlers,
    OnboardingProgressHandlers,
    MembersHandlers,
    RolesHandlers,
    TeamsHandlers,
    ProjectsHandlers,
    ResourcesHandlers,
    SkillsHandlers,
    IntegrationsHandlers,
    McpCatalogHandlers,
    ConnectionsHandlers,
    GrantsHandlers,
    GuardsHandlers,
    ApprovalsHandlers,
    TokensHandlers,
    AuditHandlers,
    OrgHandlers,
    SecretsHandlers,
    AccessReviewsHandlers,
    LookupHandlers,
    MachineTokensHandlers,
    SecretDeliveryHandlers,
    ResourceDeliveryHandlers
  ])
)

/** The dashboard calls the API cross-origin with its session cookie. */
const Cors = Layer.unwrap(AppConfig.useSync((config) =>
  HttpRouter.cors({
    allowedOrigins: [config.APP_URL],
    allowedMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["content-type", "authorization"],
    credentials: true,
    maxAge: 600
  })
))

export const AppRoutes = Layer.mergeAll(ApiRoutes, AuthRoutes, WebhookRoutes, McpRoutes, OAuthMetadataRoutes, IntegrationOAuthRoutes, ConnectionOAuthRoutes, HealthRoute, Cors, SecurityHeaders).pipe(
  Layer.provide(HttpServer.layerServices)
)
