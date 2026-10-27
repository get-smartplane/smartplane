import { createFileRoute } from "@tanstack/react-router"
import { TokensPage } from "@/features/tokens/tokens-page"

export const Route = createFileRoute("/_app/tokens")({ component: TokensPage })
