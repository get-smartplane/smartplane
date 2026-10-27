import { UpdateOrg, type Org } from "@pc/domain"
import { useState, type FormEvent } from "react"
import { FormField } from "@/components/form/form-field"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { useMutation } from "@/lib/api/use-mutation"
import { formatDate } from "@/lib/format"
import { useForm } from "@/lib/forms/use-form"
import { updateOrgAtom } from "./atoms"

const messages = {
  name: "Enter a name between 1 and 80 characters.",
  auditRetentionDays: "Keep events queryable for 365 to 3650 days (1 to 10 years)."
}

/** Name and audit retention. Keyed by the saved values upstream, so a save resets the draft. */
export function OrgFormCard({ org }: { readonly org: Org }) {
  const [name, setName] = useState(org.name)
  const [retention, setRetention] = useState(String(org.auditRetentionDays))
  const form = useForm(UpdateOrg, useMutation(updateOrgAtom, { success: "Organization updated" }), messages)
  const dirty = name !== org.name || retention !== String(org.auditRetentionDays)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void form.submit({ name, auditRetentionDays: retention.trim() === "" ? Number.NaN : Number(retention) })
  }

  return (
    <Card>
      <form onSubmit={submit} noValidate className="flex flex-col gap-(--card-spacing)">
        <CardHeader>
          <CardTitle>Organization</CardTitle>
          <CardDescription>
            <span className="font-mono">{org.slug}</span> · created {formatDate(org.createdAt)}. The slug never changes, so
            links and archive keys stay put.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <FormField id="org-name" label="Name" error={form.errors.name} description="Also renames the organization in WorkOS.">
              <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} />
            </FormField>
            <FormField
              id="org-retention"
              label="Audit retention (days)"
              error={form.errors.auditRetentionDays}
              description="Queryable here for this long, then kept only in the evidence archive."
            >
              <Input
                id="org-retention"
                type="number"
                inputMode="numeric"
                min={365}
                max={3650}
                className="tabular-nums"
                value={retention}
                onChange={(e) => setRetention(e.target.value)}
              />
            </FormField>
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" variant="secondary" disabled={!dirty || form.pending}>
            {form.pending && <Spinner />}
            Save changes
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
