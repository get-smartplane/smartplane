import type { AccountMode, Resource } from "@pc/domain"
import { toast } from "sonner"
import { setModeAtom } from "@/features/connections/atoms"
import { useMutation } from "@/lib/api/use-mutation"
import type { SetupController } from "../setup/use-setup"

/**
 * What happens once a tool exists: per-person tools switch mode (each member connects later), shared OAuth
 * tools go to the provider's consent screen (the callback returns to this step), everything else is done.
 */
export const useToolConnected = (controller: SetupController, mode: AccountMode) => {
  const setMode = useMutation(setModeAtom)
  return async (resource: Resource, authorizeUrl: string | null) => {
    if (mode === "per_user") {
      if ((await setMode.execute({ id: resource.id, mode }))._tag === "Failure") return
      toast.success(`${resource.name} is added`, { description: "Each member connects their own account the first time an agent uses it." })
      return controller.finish("done", { toolResourceId: resource.id })
    }
    if (authorizeUrl !== null) {
      // Saved first, so the step knows which tool to finish when the provider sends the browser back.
      if (await controller.save({ toolResourceId: resource.id })) window.location.assign(authorizeUrl)
      return
    }
    toast.success(`${resource.name} is connected`)
    return controller.finish("done", { toolResourceId: resource.id })
  }
}
