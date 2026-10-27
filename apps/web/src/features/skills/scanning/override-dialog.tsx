import { OverrideScan, type SkillVersion } from "@pc/domain"
import { useState } from "react"
import { FormDialog } from "@/components/form/form-dialog"
import { FormField } from "@/components/form/form-field"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useMutation } from "@/lib/api/use-mutation"
import { useForm } from "@/lib/forms/use-form"
import { overrideScanAtom } from "../atoms"
import { scanStatusMeta } from "../versions/scan-status"

const messages = { reason: "Say why this version is safe to serve (up to 2000 characters)." }

/** Serving a version the scan stopped is a decision someone owns: it takes a reason and is audited. */
export function OverrideDialog({ version }: { readonly version: SkillVersion }) {
  const [reason, setReason] = useState("")
  const override = useMutation(overrideScanAtom, { success: `Version ${version.version} can be served` })
  const ref = { id: version.resourceId, version: version.version }
  const form = useForm(OverrideScan, { execute: (input: OverrideScan) => override.execute({ ...ref, ...input }), pending: override.pending }, messages)
  const status = scanStatusMeta[version.scanStatus].label.toLowerCase()
  return (
    <FormDialog
      trigger={<Button variant="outline">Override</Button>}
      title={`Override the scan for version ${version.version}?`}
      description={`The scan result is “${status}”. Overriding lets agents be served this version anyway. Your name, this reason and the result you overrode are recorded in the audit log.`}
      submitLabel="Override and allow"
      form={form}
      input={() => ({ reason })}
      onOpenChange={(open) => !open && setReason("")}
    >
      <FormField id="override-reason" label="Reason" error={form.errors.reason} description="Reviewers read this in the audit log. Name what you checked.">
        <Textarea
          id="override-reason"
          rows={3}
          required
          placeholder="e.g. Read scripts/fill.sh by hand; the download is our internal mirror."
          value={reason}
          aria-invalid={form.errors.reason !== undefined}
          onChange={(event) => setReason(event.target.value)}
        />
      </FormField>
    </FormDialog>
  )
}
