import type { Guard, GuardTestResult } from "@pc/domain"
import { FlaskConical } from "lucide-react"
import { useState, type FormEvent } from "react"
import { FormField } from "@/components/form/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { testGuardAtom } from "@/features/guards/atoms"
import { GuardTestForm } from "@/features/guards/guard-test-form"
import { TestResult } from "@/features/guards/test-result"
import { useMutation } from "@/lib/api/use-mutation"
import { useForm } from "@/lib/forms/use-form"
import type { RuleSuggestion } from "./suggestions"

const messages = { tool: "Name the tool the agent calls.", arguments: "Arguments must be valid JSON." }

/** A dry run against a call that would break the rule; edit it to see what passes. Nothing runs. */
export function RuleTry({ guard, sample }: { readonly guard: Guard; readonly sample: RuleSuggestion["sample"] }) {
  const [tool, setTool] = useState(sample.tool)
  const [args, setArgs] = useState(() => JSON.stringify(sample.arguments, null, 2))
  const [result, setResult] = useState<GuardTestResult>()
  const test = useMutation(testGuardAtom)
  const form = useForm(GuardTestForm, { ...test, execute: (payload) => test.execute({ id: guard.id, payload }) }, messages)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setResult(await form.submit({ tool, arguments: args, actor: { role: "member", teams: [] } }))
  }
  return (
    <form onSubmit={submit} noValidate className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2">
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Try it on a call</h2>
        <FormField id="setup-test-tool" label="Tool" error={form.errors.tool}>
          <Input id="setup-test-tool" className="font-mono text-xs" value={tool} onChange={(event) => setTool(event.target.value)} />
        </FormField>
        <FormField id="setup-test-args" label="Arguments (JSON)" error={form.errors.arguments}>
          <Textarea id="setup-test-args" rows={4} className="font-mono text-xs" value={args} onChange={(event) => setArgs(event.target.value)} />
        </FormField>
        <Button type="submit" variant="outline" className="w-fit" disabled={form.pending}>
          {form.pending ? <Spinner /> : <FlaskConical />}
          Run test
        </Button>
      </div>
      <div aria-live="polite" className="flex flex-col justify-center">
        {result ? <TestResult result={result} /> : <p className="rounded-lg bg-muted/55 p-4 text-sm text-muted-foreground">See how likely this call breaks the rule. Nothing runs.</p>}
      </div>
    </form>
  )
}
