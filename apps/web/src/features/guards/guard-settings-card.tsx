import { type Guard, type GuardApprover, type GuardMode, sameApprovers } from "@pc/domain"
import { Power, PowerOff } from "lucide-react"
import { useState } from "react"
import { AdvancedOptions } from "@/components/form/advanced-options"
import { FormField } from "@/components/form/form-field"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldGroup } from "@/components/ui/field"
import { useMutation } from "@/lib/api/use-mutation"
import { formatPercent } from "@/lib/format"
import { updateGuardAtom } from "./atoms"
import { ApproversField } from "./approvers-field"
import { ModeSelect } from "./mode-select"
import { ThresholdSlider } from "./threshold-slider"


/** A verify run is still writing the draft: activating now would enforce a version about to be replaced. */
const draftPending = (guard: Guard) => ["queued", "finding_targets", "drafting", "reviewing"].includes(guard.verify?.stage ?? "")
export function GuardSettingsCard({ guard }: { readonly guard: Guard }) {
  const [mode, setMode] = useState<GuardMode>(guard.mode)
  const [threshold, setThreshold] = useState(guard.threshold)
  const [approvers, setApprovers] = useState<ReadonlyArray<GuardApprover>>(guard.approvers)
  const update = useMutation(updateGuardAtom, { success: "Rule updated" })
  const dirty = mode !== guard.mode || threshold !== guard.threshold || !sameApprovers(approvers, guard.approvers)
  const active = guard.status === "active"

  return (
    <Card>
      <CardHeader>
        <CardTitle>When a call breaks it</CardTitle>
        <CardDescription>{guard.compiled ? "Changes apply to the next call." : "Verify the rule before switching it on."}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup className="gap-4">
          <ModeSelect id="guard-settings-mode" value={mode} onChange={setMode} stacked />
          {mode === "require_approval" && (
            <FormField id="guard-settings-approvers" label="Who approves" description="The requester never approves their own call.">
              <ApproversField guard={guard} value={approvers} onChange={setApprovers} />
            </FormField>
          )}
          <AdvancedOptions summary={`Sensitivity ${formatPercent(threshold)}`}>
            <FormField id="guard-settings-threshold" label="Sensitivity" description="How sure the classifier must be before the rule triggers.">
              <ThresholdSlider id="guard-settings-threshold" value={threshold} onChange={setThreshold} />
            </FormField>
          </AdvancedOptions>
        </FieldGroup>
      </CardContent>
      <CardFooter className="flex flex-wrap justify-between gap-2">
        <Button
          variant={active ? "outline" : "default"}
          disabled={update.pending || (!active && (guard.compiled === null || draftPending(guard)))}
          onClick={() => void update.execute({ id: guard.id, payload: { status: active ? "disabled" : "active" } })}
        >
          {active ? <PowerOff /> : <Power />}
          {active ? "Switch off" : "Activate"}
        </Button>
        <Button
          variant="secondary"
          disabled={!dirty || update.pending}
          onClick={() => void update.execute({ id: guard.id, payload: { mode, threshold, approvers } })}
        >
          Save
        </Button>
      </CardFooter>
    </Card>
  )
}
