import { createFileRoute } from "@tanstack/react-router"
import { GuardsPage } from "@/features/guards/guards-page"

export const Route = createFileRoute("/_app/guards/")({ component: GuardsPage })
