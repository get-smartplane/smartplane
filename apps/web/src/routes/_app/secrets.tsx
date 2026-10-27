import { createFileRoute } from "@tanstack/react-router"
import { SecretsPage } from "@/features/secrets/secrets-page"

export const Route = createFileRoute("/_app/secrets")({
  component: SecretsPage
})
