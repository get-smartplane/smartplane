import { createFileRoute } from "@tanstack/react-router"
import { Schema } from "effect"
import { LoginPage } from "@/features/auth/login-page"
import { LoginSearch } from "@/features/auth/login-search"

export const Route = createFileRoute("/login")({
  validateSearch: Schema.toStandardSchemaV1(LoginSearch),
  component: function LoginRoute() {
    return <LoginPage search={Route.useSearch()} />
  }
})
