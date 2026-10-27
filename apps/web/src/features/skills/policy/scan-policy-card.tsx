import { ScanSeverity, SkillScanPolicy, type SkillScanning } from "@pc/domain"
import { useState, type FormEvent } from "react"
import { FormField } from "@/components/form/form-field"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldGroup } from "@/components/ui/field"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { useMutation } from "@/lib/api/use-mutation"
import { useForm } from "@/lib/forms/use-form"
import { updateScanPolicyAtom } from "../atoms"
import { scannerName, severityMeta, severityOrder } from "../versions/scan-status"

const isSeverity = (value: string): value is ScanSeverity => ScanSeverity.literals.some((severity) => severity === value)

/** When a scan stops a skill version from being served. Keyed upstream by the saved policy, so a save resets it. */
export function ScanPolicyCard({ scanning }: { readonly scanning: SkillScanning }) {
  const [blockAt, setBlockAt] = useState<ScanSeverity>(scanning.policy.blockAt)
  const [requireScan, setRequireScan] = useState(scanning.policy.requireScan)
  const form = useForm(SkillScanPolicy, useMutation(updateScanPolicyAtom, { success: "Scan policy saved" }))
  const dirty = blockAt !== scanning.policy.blockAt || requireScan !== scanning.policy.requireScan

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void form.submit({ blockAt, requireScan })
  }

  return (
    <Card>
      <form onSubmit={submit} noValidate className="flex flex-col gap-(--card-spacing)">
        <CardHeader>
          <CardTitle>Scan policy</CardTitle>
          <CardDescription className="max-w-xl">
            Applies to every skill version. Checked by {scanning.scanners.map(scannerName).join(" and ") || "no scanners"}. Changes are recorded in the audit log.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-5 sm:grid-cols-2">
            <FormField id="scan-block-at" label="Block at" description="A finding this severe or worse keeps the version from agents." error={form.errors.blockAt}>
              <Select value={blockAt} onValueChange={(value) => isSeverity(value) && setBlockAt(value)}>
                <SelectTrigger id="scan-block-at" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {severityOrder.map((severity) => (
                    <SelectItem key={severity} value={severity}>
                      {severityMeta[severity].label}
                      {severity === "critical" ? "" : " and above"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <div className="flex items-start gap-3 sm:pt-7">
              <Switch id="scan-require" checked={requireScan} onCheckedChange={setRequireScan} />
              <div className="flex flex-col gap-1">
                <Label htmlFor="scan-require">Require a finished scan</Label>
                <p className="text-sm text-muted-foreground">Versions still scanning, or whose scan could not run, are not served.</p>
              </div>
            </div>
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" variant="secondary" disabled={!dirty || form.pending}>
            {form.pending && <Spinner />}
            Save policy
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
