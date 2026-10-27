import { createFileRoute } from "@tanstack/react-router"
import { WelcomePage } from "@/features/onboarding/welcome/welcome-page"

export const Route = createFileRoute("/_focus/welcome")({ component: WelcomePage })
