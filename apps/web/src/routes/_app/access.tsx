import { createFileRoute } from "@tanstack/react-router"
import { AccessPage } from "@/features/access/access-page"

export const Route = createFileRoute("/_app/access")({ component: AccessPage })
