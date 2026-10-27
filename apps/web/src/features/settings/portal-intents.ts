import type { AdminPortalIntent } from "@pc/domain"
import { Globe, KeyRound, RadioTower, RefreshCw, type LucideIcon } from "lucide-react"

export interface PortalIntentMeta {
  readonly intent: AdminPortalIntent
  readonly title: string
  readonly description: string
  readonly icon: LucideIcon
}

/** What the org's IT admin configures in the WorkOS Admin Portal, in the order they usually set it up. */
export const portalIntents: ReadonlyArray<PortalIntentMeta> = [
  {
    intent: "sso",
    title: "Single sign-on",
    description: "SAML or OIDC through your identity provider. Members sign in with their work account.",
    icon: KeyRound
  },
  {
    intent: "dsync",
    title: "Directory sync (SCIM)",
    description: "Provision members and teams from your directory. Removing someone there offboards them here.",
    icon: RefreshCw
  },
  {
    intent: "domain_verification",
    title: "Domain verification",
    description: "Prove you own your email domains so sign-ins from them join this organization.",
    icon: Globe
  },
  {
    intent: "log_streams",
    title: "Audit log streaming",
    description: "Stream audit events to your SIEM, such as Datadog, Splunk or S3, alongside the hash chain here.",
    icon: RadioTower
  }
]
