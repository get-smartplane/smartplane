import { describe, expect, it } from "@effect/vitest"
import { contextMembers, unavailableReason } from "./context-use"
import { supersededBy } from "./supersede"

describe("AI variant preference", () => {
  it("hides a classic action when an AI variant performs the same operation", () => {
    const hidden = supersededBy([
      { name: "github_create_issue", displayName: "Create Issue", audience: "human" },
      { name: "create_issue_ai", displayName: "Create Issue (Agent)", audience: "ai" },
      { name: "update_issue", displayName: "Update issue", audience: "human" },
      { name: "issue_update", displayName: "Update Issue (AI)", audience: "ai" }
    ])
    expect([...hidden]).toEqual([["github_create_issue", "create_issue_ai"], ["update_issue", "issue_update"]])
  })

  it("never hides actions meant for both audiences, or classic actions without an AI twin", () => {
    const hidden = supersededBy([
      { name: "send_request", displayName: "Send HTTP request", audience: "both" },
      { name: "send_request_ai", displayName: "Send HTTP Request (Agent)", audience: "ai" },
      { name: "lock", displayName: "Lock Issue", audience: "human" },
      { name: "legacy", displayName: "Legacy", audience: null }
    ])
    expect(hidden.size).toBe(0)
  })
})

describe("context use detection", () => {
  it("reads destructured context keys and member reads of a named parameter", () => {
    expect([...contextMembers("async run({auth:e,propsValue:t,files:n}){return n.write()}")]).toEqual(["auth", "propsValue", "files"])
    expect([...contextMembers("async e=>{let t=e.propsValue;return e.server.apiUrl+x.files}")]).toEqual(["propsValue", "server"])
    expect([...contextMembers("async run(e){return e.auth.access_token}")]).toEqual(["auth"])
  })

  it("flags actions that need Activepieces-only services and passes plain API calls", () => {
    expect(unavailableReason("async run({auth:e,propsValue:t,server:n}){}")).toContain("server API")
    expect(unavailableReason("async run({auth:e,propsValue:t,files:n}){}")).toBeNull()
    expect(unavailableReason("async run(e){await e.run.createWaitpoint({type:'WEBHOOK'})}")).toContain("pauses")
    expect(unavailableReason("async run({auth:e,propsValue:t,store:s}){return fetch(t.url)}")).toBeNull()
  })
})
