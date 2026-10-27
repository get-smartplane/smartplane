import { HttpApi, OpenApi } from "effect/http-api"
import { AccessReviewsApi } from "./access-reviews"
import { ApprovalsApi } from "./approvals"
import { AuditApi } from "./audit"
import { ConnectionsApi } from "./connections"
import { GrantsApi } from "./grants"
import { GuardsApi } from "./guards"
import { IntegrationsApi } from "./integrations"
import { LookupApi } from "./lookup"
import { MachineTokensApi } from "./machine-tokens"
import { McpCatalogApi } from "./mcp-catalog"
import { MeApi } from "./me"
import { MembersApi } from "./members"
import { OnboardingApi, OnboardingProgressApi } from "./onboarding"
import { OrgApi } from "./org"
import { ProjectsApi } from "./projects"
import { ResourcesApi } from "./resources"
import { RolesApi } from "./roles"
import { ResourceDeliveryApi, SecretDeliveryApi } from "./secret-delivery"
import { SecretsApi } from "./secrets"
import { SkillsApi } from "./skills"
import { TeamsApi } from "./teams"
import { TokensApi } from "./tokens"

export * from "./access-reviews"
export * from "./approvals"
export * from "./audit"
export * from "./connections"
export * from "./grants"
export * from "./guards"
export * from "./integrations"
export * from "./lookup"
export * from "./machine-tokens"
export * from "./mcp-catalog"
export * from "./me"
export * from "./members"
export * from "./onboarding"
export * from "./org"
export * from "./projects"
export * from "./resources"
export * from "./roles"
export * from "./secret-delivery"
export * from "./secrets"
export * from "./security"
export * from "./skills"
export * from "./teams"
export * from "./tokens"

/** The dashboard/API contract. apps/api implements it with HttpApiBuilder; apps/web derives HttpApiClient from it. */
export class PrimitiveApi extends HttpApi.make("primitive-context")
  .add(
    MeApi,
    OnboardingApi,
    OnboardingProgressApi,
    MembersApi,
    RolesApi,
    TeamsApi,
    ProjectsApi,
    ResourcesApi,
    SkillsApi,
    IntegrationsApi,
    McpCatalogApi,
    ConnectionsApi,
    GrantsApi,
    GuardsApi,
    ApprovalsApi,
    TokensApi,
    AuditApi,
    OrgApi,
    SecretsApi,
    AccessReviewsApi,
    LookupApi,
    MachineTokensApi,
    SecretDeliveryApi,
    ResourceDeliveryApi
  )
  .prefix("/api")
  .annotateMerge(OpenApi.annotations({ title: "primitive-context", version: "1" }))
{}
