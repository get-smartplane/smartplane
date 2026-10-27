import { AuditExportQuery } from "@pc/domain"
import { DateTime, Option } from "effect"
import { Download } from "lucide-react"
import { useState } from "react"
import { FormDialog } from "@/components/form/form-dialog"
import { FormField } from "@/components/form/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useMutation } from "@/lib/api/use-mutation"
import { useForm } from "@/lib/forms/use-form"
import { exportAuditAtom } from "./atoms"
import { downloadText } from "./download"

const messages = { from: "Choose a start date.", to: "Choose an end date." }
const today = () => new Date().toISOString().slice(0, 10)
const startOfDay = (date: string) => Option.getOrElse(DateTime.make(`${date}T00:00:00Z`), () => date)

/** NDJSON evidence export for the half-open range [from, to); `to` is exclusive, so the end date is included by adding a day. */
export function ExportDialog() {
  const [from, setFrom] = useState(() => new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10))
  const [to, setTo] = useState(today)
  const form = useForm(AuditExportQuery, useMutation(exportAuditAtom, { success: "Export ready" }), messages)
  const toExclusive = (date: string) => {
    const start = startOfDay(date)
    return DateTime.isDateTime(start) ? DateTime.add(start, { days: 1 }) : start
  }

  return (
    <FormDialog
      trigger={
        <Button variant="outline">
          <Download />
          Export
        </Button>
      }
      title="Export audit evidence"
      description="Newline-delimited JSON with hashes, so an auditor can re-verify the chain offline. Exports are themselves audited."
      submitLabel="Download NDJSON"
      form={form}
      input={() => ({ from: startOfDay(from), to: toExclusive(to) })}
      onSuccess={(ndjson) => downloadText(ndjson, `audit-${from}-to-${to}.ndjson`, "application/x-ndjson")}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="export-from" label="From" error={form.errors.from}>
          <Input id="export-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </FormField>
        <FormField id="export-to" label="To (inclusive)" error={form.errors.to}>
          <Input id="export-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </FormField>
      </div>
    </FormDialog>
  )
}
