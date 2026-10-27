import type { RoleSlug } from "@pc/domain"
import type { FieldErrors } from "@/lib/forms/decode-form"
import { AccessStep, errorsUnder } from "./access-step"
import { ProjectsStep } from "./projects-step"
import { ReviewStep } from "./review-step"
import { TeamsStep } from "./teams-step"
import type { InviteSetupState } from "./use-invite-setup"

export type SetupStepId = "teams" | "projects" | "access" | "review"

export const setupSteps = [
  { id: "teams", label: "Teams" },
  { id: "projects", label: "Projects" },
  { id: "access", label: "Access" },
  { id: "review", label: "Review" }
] as const satisfies ReadonlyArray<{ readonly id: SetupStepId; readonly label: string }>

interface SetupBodyProps {
  readonly step: SetupStepId
  readonly state: InviteSetupState
  readonly role: RoleSlug | undefined
  /** The people being invited; absent when changing a pending invitation. */
  readonly emails?: ReadonlyArray<string>
  /** Errors keyed by payload path; access errors may sit under `access.` (invite) or at the root (edit). */
  readonly errors: FieldErrors
}

/** The access steps, shared by inviting and by changing a pending invitation. */
export function SetupBody({ step, state, role, emails, errors }: SetupBodyProps) {
  const { setup } = state
  switch (step) {
    case "teams":
      return <TeamsStep teamIds={setup.teamIds} onChange={state.setTeamIds} />
    case "projects":
      return <ProjectsStep projectIds={setup.projectIds} onToggle={state.toggleProject} />
    case "access":
      return (
        <AccessStep
          grants={setup.grants}
          onAdd={state.addGrant}
          update={state.updateGrant}
          onRemove={state.removeGrant}
          register={state.register}
          teamIds={setup.teamIds}
          role={role}
          errors={{ ...errorsUnder(errors, "grants"), ...errorsUnder(errors, "access.grants") }}
        />
      )
    case "review":
      return (
        <>
          <ReviewStep emails={emails} role={role} setup={setup} />
          {Object.keys(errors).length > 0 && (
            <p role="alert" className="text-sm text-danger-ink">
              {Object.values(errors)[0]}
            </p>
          )}
        </>
      )
  }
}
