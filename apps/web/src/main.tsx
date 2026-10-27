import { RegistryProvider } from "@effect/atom-react"
import { createRouter, RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { ThemeProvider } from "@/components/theme/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { routeTree } from "./routeTree.gen"
import "./index.css"

const router = createRouter({ routeTree, defaultPreload: "intent", scrollRestoration: true })

declare module "@tanstack/react-router" {
  interface Register {
    readonly router: typeof router
  }
}

const root = document.getElementById("root")
if (root === null) throw new Error("index.html is missing #root")

createRoot(root).render(
  <StrictMode>
    <RegistryProvider>
      <ThemeProvider>
        <TooltipProvider delayDuration={300}>
          <RouterProvider router={router} />
        </TooltipProvider>
      </ThemeProvider>
    </RegistryProvider>
  </StrictMode>
)
