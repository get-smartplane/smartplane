import type { Guard, GuardTestResult } from "@pc/domain"
import { FlaskConical } from "lucide-react"
import { useState, type FormEvent } from "react"
import { AdvancedOptions } from "@/components/form/advanced-options"
import { FormField } from "@/components/form/form-field"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { useMutation } from "@/lib/api/use-mutation"
import { useForm } from "@/lib/forms/use-form"
import { testGuardAtom } from "./atoms"
import { GuardTestForm } from "./guard-test-form"
import { TestResult } from "./test-result"

const messages = { tool: "Name the tool the agent calls.", arguments: "Arguments must be valid JSON." }

export function GuardTestPanel({ guard }: { readonly guard: Guard }) {
  const [tool, setTool] = useState("delete_file")
  const [args, setArgs] = useState('{\n  "path": "/reports/Q3/summary.pdf"\n}')
  const [role, setRole] = useState("member")
  const [teams, setTeams] = useState("")
  const [result, setResult] = useState<GuardTestResult>()
  const test = useMutation(testGuardAtom)
  const form = useForm(GuardTestForm, { ...test, execute: (payload) => test.execute({ id: guard.id, payload }) }, messages)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const teamList = teams.split(",").map((team) => team.trim()).filter((team) => team !== "")
    setResult(await form.submit({ tool, arguments: args, actor: { role, teams: teamList } }))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Try it</CardTitle>
        <CardDescription>Describe a call an agent might make and see whether the rule would trigger. Nothing runs.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} noValidate className="grid gap-5 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <FormField id="test-tool" label="Tool" error={form.errors.tool}>
              <Input id="test-tool" className="font-mono" value={tool} onChange={(e) => setTool(e.target.value)} />
            </FormField>
            <FormField id="test-args" label="Arguments (JSON)" error={form.errors.arguments}>
              <Textarea id="test-args" rows={5} className="font-mono text-xs" value={args} onChange={(e) => setArgs(e.target.value)} />
            </FormField>
            <AdvancedOptions label="Who is calling" summary={`As a ${role}${teams.trim() ? ` in ${teams}` : ""}`}>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField id="test-role" label="Role">
                  <Input id="test-role" value={role} onChange={(e) => setRole(e.target.value)} />
                </FormField>
                <FormField id="test-teams" label="Teams" description="Comma-separated.">
                  <Input id="test-teams" value={teams} onChange={(e) => setTeams(e.target.value)} />
                </FormField>
              </div>
            </AdvancedOptions>
            <Button type="submit" className="w-fit" disabled={form.pending || guard.compiled === null}>
              {form.pending ? <Spinner /> : <FlaskConical />}
              Run test
            </Button>
          </div>
          <div aria-live="polite">
            {result ? (
              <TestResult result={result} />
            ) : (
              <p className="rounded-lg bg-muted/55 p-4 text-sm text-muted-foreground">
                {guard.compiled ? "The result shows here: how likely the call breaks the rule, against its sensitivity." : "Verify the rule first, then test it."}
              </p>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
