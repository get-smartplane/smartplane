import { createRootRoute, Outlet } from "@tanstack/react-router"
import { Toaster } from "@/components/ui/sonner"
import { NotFoundPage } from "@/features/shell/not-found-page"

export const Route = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <Toaster position="bottom-right" />
    </>
  ),
  notFoundComponent: NotFoundPage
})
