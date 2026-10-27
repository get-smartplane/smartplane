import { CreateAccessReview, type ProjectId } from "@pc/domain"
import { useNavigate } from "@tanstack/react-router"
import { DateTime, Option } from "effect"
import { Plus } from "lucide-react"
import { useState } from "react"
import { AdvancedOptions } from "@/components/form/advanced-options"
import { FormDialog } from "@/components/form/form-dialog"
import { FormField } from "@/components/form/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ProjectSelect } from "@/features/projects/project-select"
import { useMutation } from "@/lib/api/use-mutation"
import { useForm } from "@/lib/forms/use-form"
import { createReviewAtom } from "./atoms"

const messages = { name: "Enter a name between 1 and 80 characters.", dueAt: "Choose a valid date." }
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
const quarterName = () => {
  const now = new Date()
  return `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()} access review`
}
/** Due at the end of the chosen day (UTC); blank means no due date. */
const endOfDay = (date: string) => (date === "" ? null : Option.getOrElse(DateTime.make(`${date}T23:59:59Z`), () => date))

export function CreateReviewDialog() {
  const navigate = useNavigate()
  const [name, setName] = useState(quarterName)
  const [projectId, setProjectId] = useState<ProjectId | null>(null)
  const [due, setDue] = useState(() => inDays(14))
  const form = useForm(CreateAccessReview, useMutation(createReviewAtom, { success: "Review started" }), messages)
  const summary = [projectId === null ? "Whole organization" : "One project", due === "" ? "no due date" : `due ${due}`].join(" · ")

  return (
    <FormDialog
      trigger={
        <Button>
          <Plus />
          New review
        </Button>
      }
      title="Start an access review"
      description="Lists the access in scope as it is right now. Revoking an item takes effect at once."
      submitLabel="Start review"
      form={form}
      input={() => ({ name, scope: projectId === null ? { type: "org" } : { type: "project", projectId }, dueAt: endOfDay(due) })}
      onSuccess={(review) => void navigate({ to: "/reviews/$reviewId", params: { reviewId: review.id } })}
    >
      <FormField id="review-name" label="Name" error={form.errors.name}>
        <Input id="review-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>
      <AdvancedOptions summary={summary} forceOpen={form.errors.dueAt !== undefined}>
        <FormField
          id="review-scope"
          label="Scope"
          description={
            projectId === null
              ? "Every membership and every grant in the organization."
              : "Only grants on this project's resources. Memberships are covered by org-wide reviews."
          }
        >
          <ProjectSelect id="review-scope" value={projectId} onChange={setProjectId} orgWideLabel="Whole organization" />
        </FormField>
        <FormField id="review-due" label="Due" error={form.errors.dueAt} description="Two weeks by default. Leave blank for no due date.">
          <Input id="review-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </FormField>
      </AdvancedOptions>
    </FormDialog>
  )
}
