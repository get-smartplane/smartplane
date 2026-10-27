import { Name, type Resource } from "@pc/domain"
import { Redacted, Schema } from "effect"
import { Database } from "lucide-react"
import { useState, type FormEvent } from "react"
import { FormField } from "@/components/form/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { createResourceAtom, removeResourceAtom } from "@/features/resources/atoms"
import { useMutation } from "@/lib/api/use-mutation"
import { decodeForm, type FieldErrors } from "@/lib/forms/decode-form"

const PostgresInput = Schema.Struct({
  name: Name,
  connection: Schema.String.check(Schema.isPattern(/^postgres(?:ql)?:\/\/\S+$/))
})
const decode = decodeForm(PostgresInput, {
  name: "Enter a name between 1 and 80 characters.",
  connection: "Paste a connection string that starts with postgres://"
})

/**
 * The connection string becomes an encrypted secret, then a read-only database resource that references it;
 * if the database is refused, the secret is removed again so no orphan credential stays.
 */
export function PostgresForm({ onCreated }: { readonly onCreated: (resource: Resource) => Promise<void> }) {
  const [name, setName] = useState("Postgres")
  const [connection, setConnection] = useState("")
  const [errors, setErrors] = useState<FieldErrors>({})
  const create = useMutation(createResourceAtom)
  const remove = useMutation(removeResourceAtom, { quiet: true })

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const input = decode({ name, connection })
    if (input._tag === "Invalid") return setErrors(input.errors)
    setErrors({})
    const secret = await create.execute({ name: `${input.value.name} connection`.slice(0, 80), description: `Connection string for ${input.value.name}.`, projectId: null, config: { kind: "secret", value: Redacted.make(input.value.connection) } })
    if (secret._tag === "Failure") return
    // Stored: the plaintext has no reason to stay in the form.
    setConnection("")
    const database = await create.execute({ name: input.value.name, description: "", projectId: null, config: { kind: "database", engine: "postgres", connectionSecretId: secret.value.id, readOnly: true } })
    if (database._tag === "Failure") return void (await remove.execute(secret.value.id))
    await onCreated(database.value)
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <FormField id="setup-pg-name" label="Name" error={errors["name"]}>
          <Input id="setup-pg-name" value={name} aria-invalid={errors["name"] !== undefined} onChange={(event) => setName(event.target.value)} />
        </FormField>
        <FormField id="setup-pg-connection" label="Connection string" error={errors["connection"]} description="Encrypted at rest; agents never see it. Queries run read-only.">
          <Input id="setup-pg-connection" type="password" autoComplete="off" placeholder="postgres://user:password@host:5432/db" value={connection} aria-invalid={errors["connection"] !== undefined} onChange={(event) => setConnection(event.target.value)} />
        </FormField>
      </div>
      <Button type="submit" className="w-fit" disabled={create.pending}>
        {create.pending ? <Spinner /> : <Database />}
        Add database
      </Button>
    </form>
  )
}
