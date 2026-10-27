import { assert, describe, it } from "@effect/vitest"
import { reviewDraft } from "./review"

const rule = "nobody creates issues on linear without my permission"

describe("reviewDraft", () => {
  it("flags the draft production returned for the Linear rule", () => {
    const codes = reviewDraft(rule, "require_approval", {
      instructions:
        "Does the proposed action create an issue on the Linear integration without the owner's explicit permission, including indirect forms such as moving, renaming, or overwriting existing issues, bulk operations, or wildcard paths, unless the actor has a role of 'owner' or 'admin'?",
      examples: [
        { action: "member creates issue", violates: true },
        { action: "owner updates existing issue", violates: false },
        { action: "admin bulk edits issues", violates: false },
        { action: "auditor views issue", violates: false }
      ]
    }).map((issue) => issue.code)
    assert.deepStrictEqual(codes, ["leaked_example", "approval_in_question", "invented_role_exception"])
  })

  it("accepts a specific question with near misses", () => {
    const issues = reviewDraft(rule, "require_approval", {
      instructions: "Does this action create a new issue in Linear?",
      examples: [
        { action: "linear.create_issue {title: \"Bug\"}", violates: true },
        { action: "linear.import_issues {csv: \"backlog.csv\"}", violates: true },
        { action: "linear.update_issue {id: \"ENG-1\", status: \"Done\"}", violates: false },
        { action: "linear.add_comment {id: \"ENG-1\"}", violates: false }
      ]
    })
    assert.deepStrictEqual(issues, [])
  })

  it("allows words the rule itself uses, and permission talk outside approval mode", () => {
    const issues = reviewDraft("tell me when a Zendesk ticket gets public permissions", "monitor", {
      instructions: "Does this action change a Zendesk ticket's permissions to public?",
      examples: [
        { action: "zendesk.share {ticket: 1, public: true}", violates: true },
        { action: "zendesk.get {ticket: 1}", violates: false },
        { action: "zendesk.share {ticket: 2, public: true}", violates: true },
        { action: "zendesk.comment {ticket: 1}", violates: false }
      ]
    })
    assert.deepStrictEqual(issues, [])
  })
})

describe("reviewDraft with tools", () => {
  const tools = { listed: ["notion__notion-update-page", "notion__notion-fetch"], referenced: ["notion__notion-update-page"] }
  const examples = [
    { action: "notion__notion-update-page {\"page_id\":\"1f2e\"} (tick a to-do)", violates: true },
    { action: "notion__notion-update-page {\"page_id\":\"2a3b\"} (check off an item)", violates: true },
    { action: "notion__notion-fetch {\"id\":\"1f2e\"} (read the list)", violates: false },
    { action: "notion__notion-update-page {\"page_id\":\"9d8c\"} (edit a doc)", violates: false }
  ]
  const rule = "nobody can update todo list in notion"

  it("accepts a question that names the listed tools", () => {
    assert.deepStrictEqual(reviewDraft(rule, "enforce", { instructions: "Does this call update the Notion to-do list, e.g. notion__notion-update-page on one of its items?", examples }, "", tools), [])
  })

  it("rejects invented tools, a question naming no tool, and ids copied from test calls", () => {
    const codes = reviewDraft(rule, "enforce", {
      instructions: "Does this call update the Todo list (collection://4411a2b3c4d5e6f7a8b9c0d1e2f3a4b5) in Notion?",
      examples
    }, "", { ...tools, referenced: ["notion.update_page"] }).map((issue) => issue.code)
    assert.deepStrictEqual(codes, ["unknown_tool", "no_tool_named", "invented_id"])
  })
})
