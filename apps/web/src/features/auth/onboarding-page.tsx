import { CreateOrg } from "@pc/domain"
import { useNavigate } from "@tanstack/react-router"
import { useState, type FormEvent } from "react"
import { FormField } from "@/components/form/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { useMutation } from "@/lib/api/use-mutation"
import { decodeForm, type FieldErrors } from "@/lib/forms/decode-form"
import { AuthLayout } from "./auth-layout"
import { OnboardingAside } from "./onboarding-aside"
import { createOrgAtom } from "./onboarding-atoms"
import { takeOrganization } from "./signup-intent"

const decode = decodeForm(CreateOrg, { name: "Enter a name between 1 and 80 characters." })

export function OnboardingPage() {
  const navigate = useNavigate()
  const createOrg = useMutation(createOrgAtom, { success: "Organization created" })
  const [name, setName] = useState(takeOrganization)
  const [errors, setErrors] = useState<FieldErrors>({})

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const result = decode({ name })
    if (result._tag === "Invalid") return setErrors(result.errors)
    setErrors({})
    const outcome = await createOrg.execute(result.value)
    // A new org starts with its setup flow; it can be left at any step and resumed from the overview.
    if (outcome._tag === "Success") await navigate({ to: "/setup" })
    else if (outcome.error._tag === "Conflict") setErrors({ name: outcome.error.message })
  }

  return (
    <AuthLayout aside={<OnboardingAside />}>
      <form className="flex flex-col gap-8" onSubmit={submit} noValidate>
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-[2rem] leading-9">Name your organization</h1>
          <p className="text-[0.9375rem] text-pretty text-muted-foreground">
            You will be its owner. Everything else, from SSO to your first resource, comes after.
          </p>
        </div>
        <FormField id="org-name" label="Organization name" error={errors["name"]} description="Usually your company name.">
          <Input
            id="org-name"
            autoFocus
            autoComplete="organization"
            placeholder="Acme Inc."
            className="h-10"
            value={name}
            aria-invalid={errors["name"] !== undefined}
            onChange={(event) => setName(event.target.value)}
          />
        </FormField>
        <Button size="lg" type="submit" disabled={createOrg.pending}>
          {createOrg.pending && <Spinner />}
          Create organization
        </Button>
      </form>
    </AuthLayout>
  )
}
