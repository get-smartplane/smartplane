import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import { CreateGuard, Guard, GuardTestCase, GuardTestResult, UpdateGuard } from "../access/guard"
import { AddGuardTestCall } from "../access/guard-grounding"
import { ConfirmGuardPin, GuardPinStats } from "../access/guard-pins"
import { CreateGuardFromStarter } from "../access/guard-starter"
import { Conflict, Forbidden, InvalidInput, NotFound, UpstreamFailure } from "../errors"
import { GuardId } from "../ids"
import { Authentication } from "./security"

const params = { id: GuardId }

export class GuardsApi extends HttpApiGroup.make("guards")
  .add(
    HttpApiEndpoint.get("list", "/", { success: Schema.Array(Guard), error: Forbidden }),
    HttpApiEndpoint.post("create", "/", {
      payload: CreateGuard,
      success: Guard.pipe(HttpApiSchema.status(201)),
      error: [Forbidden, NotFound, InvalidInput]
    }),
    /**
     * Creates a guard from a prepared rule (`GuardStarterId`): compiled and tested ahead of time, so it comes back a
     * draft whose verify is already `done` and can be switched on at once. Free-text rules use `create` and `compile`.
     */
    HttpApiEndpoint.post("createFromStarter", "/from-starter", {
      payload: CreateGuardFromStarter,
      success: Guard.pipe(HttpApiSchema.status(201)),
      error: [Forbidden, NotFound]
    }),
    HttpApiEndpoint.get("get", "/:id", { params, success: Guard, error: [Forbidden, NotFound] }),
    /**
     * Starts verifying the rule and answers 202 at once with the guard, whose `verify` is the new run. The
     * run goes through its stages in the background (`verify.stage`); poll the guard until it is `done`,
     * `failed` or `cancelled`. Its draft returns the rule to `draft` for human review; nothing activates.
     * A newer verify replaces a running one. `UpstreamFailure` when the run could not be queued.
     */
    HttpApiEndpoint.post("compile", "/:id/compile", {
      params,
      success: Guard.pipe(HttpApiSchema.status(202)),
      error: [Forbidden, NotFound, UpstreamFailure]
    }),
    /** Stops the running verify. What it already saved (a draft, pins) stays; Conflict when none is running. */
    HttpApiEndpoint.post("cancelVerify", "/:id/verify/cancel", { params, success: Guard, error: [Forbidden, NotFound, Conflict] }),
    /** Goes on testing a run waiting at `needs_confirmation` without pinning anything (pinning or "none of these" also resume it). */
    HttpApiEndpoint.post("continueVerify", "/:id/verify/continue", { params, success: Guard, error: [Forbidden, NotFound, Conflict, UpstreamFailure] }),
    /** Pins one of the candidates verify's lookup found. Nothing is pinned without this confirmation. */
    HttpApiEndpoint.post("confirmPin", "/:id/pins", {
      params,
      payload: ConfirmGuardPin,
      success: Guard,
      error: [Forbidden, NotFound, Conflict]
    }),
    /** "None of these": the rule stays semantic. */
    HttpApiEndpoint.post("dismissPins", "/:id/pins/dismiss", { params, success: Guard, error: [Forbidden, NotFound, Conflict] }),
    HttpApiEndpoint.delete("unpin", "/:id/pins/:pinId", {
      params: { id: GuardId, pinId: Schema.NonEmptyString },
      success: Guard,
      error: [Forbidden, NotFound]
    }),
    /** Per pin, how many items inside it the gateway has recognised from tool results. */
    HttpApiEndpoint.get("pinStats", "/:id/pins/stats", { params, success: Schema.Array(GuardPinStats), error: [Forbidden, NotFound] }),
    /** Dry-runs the compiled guard against a sample action. Conflict if it has not been compiled. */
    HttpApiEndpoint.post("test", "/:id/test", {
      params,
      payload: GuardTestCase,
      success: GuardTestResult,
      error: [Forbidden, NotFound, Conflict, UpstreamFailure]
    }),
    /** Adds a call to the rule's test set and runs it through the classifier now when the rule is compiled. */
    HttpApiEndpoint.post("addTestCall", "/:id/test-calls", {
      params,
      payload: AddGuardTestCall,
      success: Guard,
      error: [Forbidden, NotFound, InvalidInput, UpstreamFailure]
    }),
    HttpApiEndpoint.delete("removeTestCall", "/:id/test-calls/:callId", {
      params: { id: GuardId, callId: Schema.NonEmptyString },
      success: Guard,
      error: [Forbidden, NotFound]
    }),
    HttpApiEndpoint.patch("update", "/:id", {
      params,
      payload: UpdateGuard,
      success: Guard,
      error: [Forbidden, NotFound, Conflict]
    })
  )
  .middleware(Authentication)
  .prefix("/guards")
{}
