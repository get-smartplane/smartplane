import type { ApprovalId, DecideApproval } from "@pc/domain"
import { apiMutation, apiQuery } from "@/lib/api/atoms"

export const pendingApprovalsAtom = apiQuery(["approvals"], (api) => api.approvals.listPending())

export const decideApprovalAtom = apiMutation(
  ["approvals"],
  (api, { id, payload }: { readonly id: ApprovalId; readonly payload: DecideApproval }) =>
    api.approvals.decide({ params: { id }, payload })
)
