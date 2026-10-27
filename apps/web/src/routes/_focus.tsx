import { createFileRoute, Outlet } from "@tanstack/react-router"
import { AppGate } from "@/features/shell/app-gate"

/** Signed-in, full-page flows (setup, welcome): the same principal gate as the dashboard, without its sidebar. */
export const Route = createFileRoute("/_focus")({
  component: () => (
    <AppGate>
      <Outlet />
    </AppGate>
  )
})
