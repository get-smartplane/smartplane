import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { Approval, DecideApproval } from "../access/approval"
import { Conflict, Forbidden, NotFound } from "../errors"
import { ApprovalId } from "../ids"
import { Authentication } from "./security"

export class ApprovalsApi extends HttpApiGroup.make("approvals")
  .add(
    HttpApiEndpoint.get("listPending", "/", { success: Schema.Array(Approval), error: Forbidden }),
    /** Forbidden when deciding your own request; Conflict when it is no longer pending. */
    HttpApiEndpoint.post("decide", "/:id/decision", {
      params: { id: ApprovalId },
      payload: DecideApproval,
      success: Approval,
      error: [Forbidden, NotFound, Conflict]
    })
  )
  .middleware(Authentication)
  .prefix("/approvals")
{}
