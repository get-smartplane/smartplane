import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { Forbidden, UpstreamFailure } from "../errors"
import { AdminPortalLink, AdminPortalLinkRequest, Org, UpdateOrg } from "../org/org"
import { Authentication } from "./security"

/** Org settings. Every endpoint requires `org:manage`; every change and portal link is audited. */
export class OrgApi extends HttpApiGroup.make("org")
  .add(
    HttpApiEndpoint.get("get", "/", { success: Org, error: Forbidden }),
    /** A rename is mirrored to the WorkOS Organization. */
    HttpApiEndpoint.patch("update", "/", { payload: UpdateOrg, success: Org, error: [Forbidden, UpstreamFailure] }),
    /** A short-lived WorkOS Admin Portal link for the org's IT admin (SSO, directory sync, domains, log streams). */
    HttpApiEndpoint.post("adminPortalLink", "/admin-portal-link", {
      payload: AdminPortalLinkRequest,
      success: AdminPortalLink,
      error: [Forbidden, UpstreamFailure]
    })
  )
  .middleware(Authentication)
  .prefix("/org")
{}
