import { CreateProject } from "@pc/domain"
import { Plus } from "lucide-react"
import { useState } from "react"
import { FormDialog } from "@/components/form/form-dialog"
import { FormField } from "@/components/form/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useMutation } from "@/lib/api/use-mutation"
import { useForm } from "@/lib/forms/use-form"
import { createProjectAtom } from "./atoms"

const messages = { name: "Enter a name between 1 and 80 characters." }

export function CreateProjectDialog() {
  const [name, setName] = useState("")
  const form = useForm(CreateProject, useMutation(createProjectAtom, { success: "Project created" }), messages)
  return (
    <FormDialog
      trigger={
        <Button>
          <Plus />
          New project
        </Button>
      }
      title="Create a project"
      description="Resources, rules and tokens you scope to it are only visible inside it."
      submitLabel="Create project"
      form={form}
      input={() => ({ name })}
      onOpenChange={(open) => open || setName("")}
    >
      <FormField id="project-name" label="Name" error={form.errors.name}>
        <Input
          id="project-name"
          placeholder="Customer support agent"
          autoFocus
          value={name}
          aria-invalid={form.errors.name !== undefined}
          onChange={(event) => setName(event.target.value)}
        />
      </FormField>
    </FormDialog>
  )
}
