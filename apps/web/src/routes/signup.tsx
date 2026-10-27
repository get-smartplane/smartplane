import { createFileRoute } from "@tanstack/react-router"
import { Schema } from "effect"
import { SignupRedirect } from "@/features/auth/signup-redirect"
import { rememberOrganization, SignupSearch } from "@/features/auth/signup-intent"

/** Entry point from the marketing site: keep the typed org name for onboarding, then sign up with WorkOS. */
export const Route = createFileRoute("/signup")({
  validateSearch: Schema.toStandardSchemaV1(SignupSearch),
  beforeLoad: ({ search }) => {
    rememberOrganization(search.organization)
    window.location.assign("/auth/login?signup=1")
  },
  component: SignupRedirect
})
