import { Mail } from "lucide-react"
import { useQueryData } from "@/components/query/use-query-data"
import { Button } from "@/components/ui/button"
import { useMe } from "@/features/auth/me-context"
import { membersAtom } from "@/features/members/atoms"

/** There is no access-request feature yet, so a request is an email to the org's owners and admins. */
export function RequestAccess() {
  const { org, principal } = useMe()
  const admins = useQueryData(membersAtom, []).filter((member) => member.status === "active" && (member.role === "owner" || member.role === "admin") && member.email !== (principal._tag === "User" ? principal.email : ""))
  if (admins.length === 0) return <p className="text-sm text-muted-foreground">Need something else? Ask an owner or admin of {org.name} to grant it.</p>
  const subject = encodeURIComponent(`Smartplane access request (${org.name})`)
  const body = encodeURIComponent("Hi,\n\nCould my agent get access to:\n\n- \n\nWhat for:\n\nThanks!")
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/55 p-3.5">
      <p className="text-sm text-muted-foreground">Need a tool that is not listed? Ask an admin to grant it.</p>
      <Button variant="outline" size="sm" asChild>
        <a href={`mailto:${admins.map((admin) => admin.email).join(",")}?subject=${subject}&body=${body}`}>
          <Mail />
          Request access
        </a>
      </Button>
    </div>
  )
}
