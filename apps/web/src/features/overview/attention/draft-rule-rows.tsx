import { Link } from "@tanstack/react-router"
import { ShieldCheck } from "lucide-react"
import { useQueryData } from "@/components/query/use-query-data"
import { guardsAtom } from "@/features/guards/atoms"
import { AttentionRow, attentionLinkClass } from "./attention-row"

export function DraftRuleRows() {
  const drafts = useQueryData(guardsAtom, []).filter((guard) => guard.status === "draft")
  return drafts.map((guard) => (
    <li key={guard.id}>
      <Link to="/guards/$guardId" params={{ guardId: guard.id }} className={attentionLinkClass}>
        <AttentionRow
          icon={ShieldCheck}
          tone="neutral"
          title={guard.name}
          detail={guard.compiled ? "Draft · review the verified check, then activate" : "Draft · verify it to start checking calls"}
        />
      </Link>
    </li>
  ))
}
