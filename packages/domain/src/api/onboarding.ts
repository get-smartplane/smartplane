import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import { Conflict, Forbidden, NotFound, UpstreamFailure } from "../errors"
import { MemberWelcome, OnboardingProgress, OrgSetup, UpdateMemberWelcome, UpdateOrgSetup } from "../org/onboarding"
import { CreateOrg, Org } from "../org/org"
import { Authentication, SessionAuthentication } from "./security"

/** Self-serve sign-up: the caller has a session but no org yet. apps/api re-seals the session into the new org. */
export class OnboardingApi extends HttpApiGroup.make("onboarding")
  .add(
    HttpApiEndpoint.post("createOrg", "/orgs", {
      payload: CreateOrg,
      success: Org.pipe(HttpApiSchema.status(201)),
      error: [Conflict, UpstreamFailure]
    })
  )
  .middleware(SessionAuthentication)
  .prefix("/onboarding")
{}

/**
 * Onboarding progress inside an org: the admin setup flow (per org, `resources:manage`) and the invited
 * member's welcome (per user). Every change is audited as `onboarding.updated`.
 */
export class OnboardingProgressApi extends HttpApiGroup.make("onboardingProgress")
  .add(
    HttpApiEndpoint.get("get", "/progress", { success: OnboardingProgress, error: Forbidden }),
    /** Merges the given step states and fields; a tool or rule must exist in the org. */
    HttpApiEndpoint.patch("updateSetup", "/setup", { payload: UpdateOrgSetup, success: OrgSetup, error: [Forbidden, NotFound] }),
    HttpApiEndpoint.put("updateWelcome", "/welcome", { payload: UpdateMemberWelcome, success: MemberWelcome, error: Forbidden })
  )
  .middleware(Authentication)
  .prefix("/onboarding")
{}
