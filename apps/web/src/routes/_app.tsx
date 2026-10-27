import { createFileRoute } from "@tanstack/react-router"
import { AppGate } from "@/features/shell/app-gate"

export const Route = createFileRoute("/_app")({ component: AppGate })
