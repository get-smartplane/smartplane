import { UpstreamFailure } from "@pc/domain"
import { Effect, Layer } from "effect"
import { Classifier } from "../guards/classifier"
import { WorkersAi } from "../platform/ai"

export const rule = "nobody can update todo list in notion"

const draft = (instructions: string) => ({
  intent: { mode: "enforce", approvers: [], operations: ["create", "update", "delete"] },
  tools: ["notion__notion-update-page"],
  instructions,
  examples: [
    { tool: "notion__notion-update-page", arguments: { page_id: "todo-row", properties: { Done: "__YES__" } }, action: "tick a to-do", violates: true },
    { tool: "notion__notion-fetch", arguments: { id: "groceries-page" }, action: "read the to-do list", violates: false },
    { tool: "notion__notion-update-page", arguments: { page_id: "docs-page", command: "update_content" }, action: "edit a doc", violates: false },
    { tool: "notion__notion-create-pages", arguments: { parent: { data_source_id: "todo-source" } }, action: "add a to-do", violates: true }
  ]
})

const generated = {
  calls: [
    { tool: "notion-update-page", arguments: { page_id: "todo-row-2", properties: { Status: "Done" } }, violates: true, note: "finish a to-do" },
    { tool: "notion-update-page", arguments: { page_id: "handbook", command: "replace_content" }, violates: false, note: "rewrite the handbook" }
  ]
}

export interface AiScript {
  /** How the example writer answers; `never` makes it hang until its timeout. */
  readonly examples?: "ok" | "never" | "fail"
  /** How the compiler answers: `fail` every draft, or fail only the first `n` drafts. */
  readonly drafts?: "ok" | "fail" | number
}

/**
 * The compiler and example generator, told apart by their system prompts; drafts count up (Q1, then Q2).
 * Every input is kept in `inputs`, to check what reaches a model.
 */
export const fakeAi = (drafts: Array<string>, inputs: Array<unknown>, script: AiScript) => {
  let failures = 0
  return Layer.succeed(WorkersAi, {
    run: (_model, input) => {
      inputs.push(input)
      const messages = Array.isArray(input["messages"]) ? input["messages"] : []
      const system = JSON.stringify(messages[0] ?? "")
      if (system.includes("realistic test calls")) {
        return script.examples === "never" ? Effect.never : script.examples === "fail" ? Effect.fail(new UpstreamFailure({ upstream: "workers-ai", message: "busy" })) : Effect.succeed({ response: generated })
      }
      if (script.drafts === "fail" || (typeof script.drafts === "number" && failures < script.drafts)) {
        failures += 1
        return Effect.fail(new UpstreamFailure({ upstream: "workers-ai", message: "busy" }))
      }
      return Effect.sync(() => {
        drafts.push(JSON.stringify(messages.at(-1)))
        return { response: draft(drafts.length === 1 ? "Q1: Does this call edit Notion with notion__notion-update-page?" : "Q2: Does this call change a Notion to-do (notion__notion-update-page on a todo row)?") }
      })
    }
  })
}

/** Q1 misses everything; Q2 flags exactly the calls that touch a to-do. Every state asked is kept in `states`. */
export const fakeClassifier = (states: Array<unknown>) =>
  Layer.succeed(Classifier, {
    classify: (state, questions) =>
      Effect.sync(() => {
        states.push({ state, questions: [...questions.values()] })
        const question = [...questions.values()][0] ?? ""
        const todo = /todo/i.test(JSON.stringify(state).replace(/"tool[A-Za-z]*":"[^"]*"/g, ""))
        return new Map([...questions.keys()].map((id) => [id, question.startsWith("Q2") && todo ? 0.92 : 0.08]))
      })
  })
