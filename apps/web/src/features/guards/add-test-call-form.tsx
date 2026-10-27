import { AddGuardTestCall, type Guard } from "@pc/domain"
import { Plus } from "lucide-react"
import { Schema } from "effect"
import { useState, type FormEvent } from "react"
import { FormField } from "@/components/form/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { useMutation } from "@/lib/api/use-mutation"
import { useForm } from "@/lib/forms/use-form"
import { cn } from "@/lib/utils"
import { addTestCallAtom } from "./atoms"

/** The form edits `arguments` as JSON text; decoding parses it into the payload's shape. */
const AddTestCallForm = Schema.Struct({ ...AddGuardTestCall.fields, arguments: Schema.fromJsonString(Schema.Json) })
const messages = { tool: "Name the tool as <resource>__<tool>.", arguments: "Arguments must be valid JSON." }

/** Adds a call of your own to the test set; it is tested now and again on every verify. */
export function AddTestCallFormView({ guard }: { readonly guard: Guard }) {
  const suggestions = guard.compiled?.grounding?.tools ?? []
  const [tool, setTool] = useState(suggestions[0] ?? "")
  const [args, setArgs] = useState("{\n  \n}")
  const [violates, setViolates] = useState(true)
  const add = useMutation(addTestCallAtom, { success: "Call added and tested" })
  const form = useForm(AddTestCallForm, { ...add, execute: (payload) => add.execute({ id: guard.id, payload }) }, messages)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (await form.submit({ tool, arguments: args, violates })) setArgs("{\n  \n}")
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 rounded-lg bg-muted/45 p-3.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div className="flex flex-col gap-4">
        <FormField id="test-call-tool" label="Tool" error={form.errors.tool}>
          <Input id="test-call-tool" list="test-call-tools" className="font-mono" placeholder="notion__notion-update-page" value={tool} onChange={(e) => setTool(e.target.value)} />
          <datalist id="test-call-tools">
            {suggestions.map((name) => <option key={name} value={name} />)}
          </datalist>
        </FormField>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">This call should</legend>
          <div className="flex gap-1.5" role="radiogroup">
            {[true, false].map((value) => (
              <Button
                key={String(value)}
                type="button"
                role="radio"
                aria-checked={violates === value}
                size="sm"
                variant={violates === value ? "secondary" : "ghost"}
                className={cn(violates === value && "ring-1 ring-input")}
                onClick={() => setViolates(value)}
              >
                {value ? "Break the rule" : "Be allowed"}
              </Button>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="flex flex-col gap-3">
        <FormField id="test-call-args" label="Arguments (JSON)" error={form.errors.arguments}>
          <Textarea id="test-call-args" rows={4} className="font-mono text-xs" value={args} onChange={(e) => setArgs(e.target.value)} />
        </FormField>
        <Button type="submit" variant="outline" className="w-fit" disabled={form.pending || guard.compiled === null}>
          {form.pending ? <Spinner /> : <Plus />}
          Add and test
        </Button>
      </div>
    </form>
  )
}
