import { createFileRoute } from "@tanstack/react-router"
import { MembersPage } from "@/features/members/members-page"

export const Route = createFileRoute("/_app/members")({ component: MembersPage })
