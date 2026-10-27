import type { AccessReview } from "@pc/domain"
import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { downloadText } from "@/features/audit/download"
import { useMutation } from "@/lib/api/use-mutation"
import { exportReviewAtom } from "./atoms"

const fileName = (review: AccessReview) =>
  `${review.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "access-review"}.csv`

/** One row per item with its decision trail, for the auditor's working papers. Available once closed. */
export function ExportReviewButton({ review }: { readonly review: AccessReview }) {
  const exportCsv = useMutation(exportReviewAtom, { success: "Evidence exported" })
  const download = async () => {
    const outcome = await exportCsv.execute(review.id)
    if (outcome._tag === "Success") downloadText(outcome.value, fileName(review), "text/csv")
  }
  return (
    <Button variant="outline" disabled={exportCsv.pending} onClick={() => void download()}>
      {exportCsv.pending ? <Spinner /> : <Download />}
      Export CSV
    </Button>
  )
}
