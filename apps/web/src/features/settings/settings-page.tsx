import { Building2 } from "lucide-react"
import { Page } from "@/components/layout/page"
import { CollapsibleSection } from "@/components/layout/collapsible-section"
import { PageHeader } from "@/components/layout/page-header"
import { Section } from "@/components/layout/section"
import { QueryView } from "@/components/query/query-view"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useCan, useMe } from "@/features/auth/me-context"
import { ScanPolicySection } from "@/features/skills/policy/scan-policy-section"
import { formatDate } from "@/lib/format"
import { orgAtom } from "./atoms"
import { OrgFormCard } from "./org-form-card"
import { PortalCard } from "./portal-card"
import { portalIntents } from "./portal-intents"
import { RotateKeysCard } from "./rotate-keys-card"

/** Read-only summary for members without `org:manage`; every settings endpoint requires it. */
function OrgSummary() {
  const { org } = useMe()
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="size-4 text-muted-foreground" />
          {org.name}
        </CardTitle>
        <CardDescription>
          <span className="font-mono">{org.slug}</span> · created {formatDate(org.createdAt)} · audit events queryable for{" "}
          {org.auditRetentionDays} days, then archived
        </CardDescription>
      </CardHeader>
    </Card>
  )
}

export function SettingsPage() {
  const canManage = useCan("org:manage")
  if (!canManage) {
    return (
      <Page>
        <PageHeader title="Organization" description="Only owners can change these settings." />
        <OrgSummary />
      </Page>
    )
  }
  return (
    <Page>
      <PageHeader title="Organization" description="Name, sign-in, directory sync and encryption. Every change is recorded in the audit log." />
      <QueryView atom={orgAtom}>
        {(org) => <OrgFormCard key={`${org.name}-${org.auditRetentionDays}`} org={org} />}
      </QueryView>
      <Section
        title="Sign-in and directory"
        description="Set up by your IT admin in the WorkOS Admin Portal. Each link works once and expires within minutes."
      >
        <div className="grid gap-3 md:grid-cols-2">
          {portalIntents.map((meta) => (
            <PortalCard key={meta.intent} meta={meta} />
          ))}
        </div>
      </Section>
      <ScanPolicySection />
      <CollapsibleSection title="Encryption keys" description="Only needed after the platform key is rotated. Secrets are envelope-encrypted; plaintext is never stored.">
        <RotateKeysCard />
      </CollapsibleSection>
    </Page>
  )
}
