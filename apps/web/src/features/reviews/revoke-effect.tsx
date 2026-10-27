import type { ReactNode } from "react"
import type { ReviewedAccess } from "@pc/domain"
import { EntityName } from "@/components/status/entity-name"
import { subjectRef } from "@/lib/lookup/refs"

const Name = ({ children }: { readonly children: ReactNode }) => (
  <span className="inline-flex max-w-full align-bottom font-medium text-foreground">{children}</span>
)

/** What a revoke does right away, in words a reviewer can confirm against. */
export function RevokeEffect({ access }: { readonly access: ReviewedAccess }) {
  if (access._tag === "Membership") {
    return (
      <p>
        <Name>{access.email}</Name> is offboarded immediately: the membership ends, their access tokens and direct grants
        are revoked, and they leave every team.
      </p>
    )
  }
  return (
    <p>
      The grant is revoked immediately. Agents acting for{" "}
      <Name>
        <EntityName entity={subjectRef(access.subject)} />
      </Name>{" "}
      lose {access.action} access to{" "}
      <Name>
        <EntityName entity={{ kind: "resource", id: access.resourceId }} />
      </Name>{" "}
      on their next call.
    </p>
  )
}
