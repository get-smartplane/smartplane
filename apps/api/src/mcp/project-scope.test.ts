import { describe, expect, it } from "vitest"
import { ProjectId } from "@pc/domain"
import { userPrincipal } from "../testing/fixtures"
import { scopeToProject } from "./project-scope"

const project = ProjectId.make("prj_projecta01")

describe("the x-smartplane-project header", () => {
  it("leaves the caller as is when absent", () => {
    const principal = userPrincipal()
    expect(scopeToProject(principal, undefined)).toMatchObject({ _tag: "Success", success: principal })
  })

  it("narrows an unscoped caller to one project", () => {
    const scoped = scopeToProject(userPrincipal(), project)
    expect(scoped._tag === "Success" && scoped.success.projectId).toBe(project)
  })

  it("never moves a project-scoped token to another project, and refuses a malformed id", () => {
    const other = userPrincipal({ projectId: ProjectId.make("prj_projectb01") })
    expect(scopeToProject(other, project)).toMatchObject({ _tag: "Failure", failure: { _tag: "Forbidden" } })
    expect(scopeToProject(other, "prj_projectb01")._tag).toBe("Success")
    expect(scopeToProject(userPrincipal(), "../etc")).toMatchObject({ _tag: "Failure", failure: { _tag: "InvalidInput" } })
  })
})
