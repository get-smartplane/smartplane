import type { Approval, DecideApproval } from "@pc/domain"
import { Check, X } from "lucide-react"
import { useState } from "react"
import { AdvancedOptions } from "@/components/form/advanced-options"
import { EntityName } from "@/components/status/entity-name"
import { StatusBadge } from "@/components/status/status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { ActorLabel } from "@/features/audit/actor-label"
import { useMe } from "@/features/auth/me-context"
import { useMutation } from "@/lib/api/use-mutation"
import { formatRelative } from "@/lib/format"
import { decideApprovalAtom } from "./atoms"

export function ApprovalCard({ approval }: { readonly approval: Approval }) {
  const { principal } = useMe()
  const [comment, setComment] = useState("")
  const decide = useMutation(decideApprovalAtom, { success: "Decision recorded" })
  // Separation of duties: the API refuses self-approval; the UI explains it up front.
  const own = approval.requestedBy.type === "user" && principal._tag === "User" && approval.requestedBy.id === principal.userId

  const submit = (decision: DecideApproval["decision"]) =>
    void decide.execute({ id: approval.id, payload: comment === "" ? { decision } : { decision, comment } })

  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <StatusBadge tone="warning">Held</StatusBadge>
          <CardTitle className="flex min-w-0 items-baseline gap-1.5 text-base">
            <code className="truncate font-mono text-[0.9375rem]">{approval.request.tool}</code>
            <span className="font-sans font-normal text-muted-foreground">on</span>
            <EntityName entity={{ kind: "resource", id: approval.request.resourceId }} />
          </CardTitle>
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">Expires {formatRelative(approval.expiresAt)}</span>
        </div>
        <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
          <span className="text-foreground">
            <ActorLabel actor={approval.requestedBy} />
          </span>
          <span>asked {formatRelative(approval.createdAt)} · paused by</span>
          <span className="font-medium text-foreground">
            <EntityName entity={{ kind: "guard", id: approval.guardId }} />
          </span>
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <pre className="max-h-48 overflow-auto rounded-md bg-muted p-3.5 text-xs leading-relaxed">{JSON.stringify(approval.request.arguments, null, 2)}</pre>
        <AdvancedOptions label="Add a note" summary="Saved with the decision in the audit log">
          <Textarea aria-label="Note" placeholder="Why you approved or rejected it" rows={2} value={comment} onChange={(event) => setComment(event.target.value)} />
        </AdvancedOptions>
      </CardContent>
      <CardFooter className="flex flex-wrap items-center justify-end gap-2">
        {own && <span className="mr-auto text-xs text-muted-foreground">You asked for this, so someone else decides.</span>}
        <Button variant="outline" disabled={own || decide.pending} onClick={() => submit("rejected")}>
          <X />
          Reject
        </Button>
        <Button disabled={own || decide.pending} onClick={() => submit("approved")}>
          <Check />
          Approve
        </Button>
      </CardFooter>
    </Card>
  )
}
