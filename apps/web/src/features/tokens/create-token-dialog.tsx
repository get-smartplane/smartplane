import { CreateAccessToken, MaxTokenTtlDays, type CreatedAccessToken } from "@pc/domain"
import { Plus } from "lucide-react"
import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { FieldGroup } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { AdvancedOptions } from "@/components/form/advanced-options"
import { useQueryData } from "@/components/query/use-query-data"
import { projectsAtom } from "@/features/projects/atoms"
import { useCan } from "@/features/auth/me-context"
import { useMutation } from "@/lib/api/use-mutation"
import { useForm } from "@/lib/forms/use-form"
import { createTokenAtom } from "./atoms"
import { TokenAdvancedFields, TokenNameField, tokenSummary, type TokenDraft } from "./token-form-fields"
import { TokenReveal } from "./token-reveal"

const initialDraft: TokenDraft = { name: "", kind: "personal", projectId: null, ttlDays: 30 }
const messages = { name: "Enter a name between 1 and 80 characters.", ttlDays: `Choose between 1 and ${MaxTokenTtlDays} days.` }

/** `variant` lets a page that already has its primary action show this as a secondary one. */
export function CreateTokenDialog({ variant = "default" }: { readonly variant?: "default" | "outline" }) {
  const canManage = useCan("tokens:manage")
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(initialDraft)
  const [created, setCreated] = useState<CreatedAccessToken>()
  const form = useForm(CreateAccessToken, useMutation(createTokenAtom, { success: "Token created" }), messages)
  const projectName = useQueryData(projectsAtom(false), []).find((project) => project.id === draft.projectId)?.name

  const changeOpen = (next: boolean) => {
    setOpen(next)
    if (next) return
    // The plaintext lives only in this component's state; closing discards it for good.
    setCreated(undefined)
    setDraft(initialDraft)
    form.reset()
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setCreated(await form.submit(draft))
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button variant={variant}>
          <Plus />
          New token
        </Button>
      </DialogTrigger>
      {/* The plaintext is shown once: a stray click outside must not discard it. */}
      <DialogContent className="sm:max-w-xl" onInteractOutside={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{created ? `${created.token.name} is ready` : "New access token"}</DialogTitle>
          <DialogDescription>
            {created ? "Paste one of these into your MCP client." : "For clients without OAuth sign-in, CI jobs and service accounts. Tokens always expire."}
          </DialogDescription>
        </DialogHeader>
        {created ? (
          <>
            <TokenReveal created={created} />
            <DialogFooter>
              <Button onClick={() => changeOpen(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} noValidate className="flex flex-col gap-6">
            <FieldGroup>
              <TokenNameField draft={draft} onChange={setDraft} errors={form.errors} />
              <AdvancedOptions summary={tokenSummary(draft, projectName)} forceOpen={form.errors.ttlDays !== undefined}>
                <TokenAdvancedFields draft={draft} onChange={setDraft} errors={form.errors} canCreateServiceAccounts={canManage} />
              </AdvancedOptions>
            </FieldGroup>
            <DialogFooter>
              <Button type="submit" disabled={form.pending}>
                {form.pending && <Spinner />}
                Create token
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
