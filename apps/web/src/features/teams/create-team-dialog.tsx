import { CreateTeam } from "@pc/domain"
import { Plus } from "lucide-react"
import { useState } from "react"
import { FormDialog } from "@/components/form/form-dialog"
import { FormField } from "@/components/form/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useMutation } from "@/lib/api/use-mutation"
import { useForm } from "@/lib/forms/use-form"
import { createTeamAtom } from "./atoms"

const messages = { name: "Enter a name between 1 and 80 characters." }

export function CreateTeamDialog() {
  const [name, setName] = useState("")
  const form = useForm(CreateTeam, useMutation(createTeamAtom, { success: "Team created" }), messages)
  return (
    <FormDialog
      trigger={
        <Button>
          <Plus />
          New team
        </Button>
      }
      title="Create a team"
      description="Teams can be grant subjects, so access follows team membership."
      submitLabel="Create team"
      form={form}
      input={() => ({ name })}
      onOpenChange={(open) => open || setName("")}
    >
      <FormField id="team-name" label="Name" error={form.errors.name}>
        <Input
          id="team-name"
          placeholder="Platform"
          value={name}
          aria-invalid={form.errors.name !== undefined}
          onChange={(event) => setName(event.target.value)}
        />
      </FormField>
    </FormDialog>
  )
}
