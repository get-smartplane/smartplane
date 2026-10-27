/**
 * Worked examples for the compiler, deliberately from systems no customer rule is likely to name (a help
 * desk, Kubernetes, a board deck) so copied wording is easy to detect: `fewShotVocabulary` lists the tell-tale
 * words and `reviewDraft` flags any that reach a draft without being in the rule, its context or its tools.
 * The first one shows the grounded form: real tool names and argument shapes from the listed tools.
 */
export interface FewShot {
  readonly rule: string
  readonly tools?: string
  readonly answer: unknown
}

export const fewShot: ReadonlyArray<FewShot> = [
  {
    rule: "nobody closes Zendesk tickets without a manager's approval",
    tools: [
      "- helpdesk__tickets_update [destructive] \"Update ticket\": Changes a ticket's fields, including status and assignee.",
      "  args: id*: number; status: \"new\"|\"open\"|\"pending\"|\"solved\"|\"closed\"; comment: {body, public}",
      "- helpdesk__tickets_bulk [destructive]: Applies the same change to many tickets.",
      "  args: ids*: number[]; changes*: {status, tags}",
      "- helpdesk__tickets_comment [write]: Adds a comment to a ticket.",
      "  args: id*: number; body*: string",
      "- helpdesk__tickets_show [read]: Reads a ticket.",
      "  args: id*: number"
    ].join("\n"),
    answer: {
      intent: { mode: "require_approval", approvers: [{ kind: "role", ref: "manager" }], cue: "without a manager's approval", operations: ["update"] },
      tools: ["helpdesk__tickets_update", "helpdesk__tickets_bulk"],
      instructions:
        "Does this call close or solve a Zendesk ticket, e.g. helpdesk__tickets_update or helpdesk__tickets_bulk with status \"solved\" or \"closed\"? Comments, reads and other status changes do not count.",
      examples: [
        { tool: "helpdesk__tickets_update", arguments: { id: 812, status: "solved" }, action: "solve ticket 812", violates: true },
        { tool: "helpdesk__tickets_bulk", arguments: { ids: [4, 9], changes: { status: "closed" } }, action: "close two tickets at once", violates: true },
        { tool: "helpdesk__tickets_comment", arguments: { id: 812, body: "Looking into it" }, action: "comment on ticket 812", violates: false },
        { tool: "helpdesk__tickets_update", arguments: { id: 812, status: "pending" }, action: "set ticket 812 to pending", violates: false }
      ]
    }
  },
  {
    rule: "only the platform team may scale Kubernetes deployments",
    answer: {
      intent: { mode: "enforce", approvers: [], cue: "only the platform team may", operations: ["update"] },
      tools: [],
      instructions: "Does this action change the replica count or autoscaling of a Kubernetes deployment, by an actor who is not on the platform team?",
      examples: [
        { action: "data-team member: kubectl.scale {deployment: \"api\", replicas: 6}", violates: true },
        { action: "data-team member: kubectl.patch_hpa {name: \"api\", maxReplicas: 20}", violates: true },
        { action: "platform-team member: kubectl.scale {deployment: \"api\", replicas: 6}", violates: false },
        { action: "data-team member: kubectl.get_pods {namespace: \"api\"}", violates: false }
      ]
    }
  },
  {
    rule: "tell me whenever someone downloads the board deck",
    answer: {
      intent: { mode: "monitor", approvers: [], cue: "tell me", operations: ["read"] },
      tools: [],
      instructions: "Does this action download, export or copy the board deck file?",
      examples: [
        { action: "drive.download {file: \"Board deck Q2.pptx\"}", violates: true },
        { action: "drive.export {file: \"Board deck Q2.pptx\", format: \"pdf\"}", violates: true },
        { action: "drive.get_metadata {file: \"Board deck Q2.pptx\"}", violates: false },
        { action: "drive.download {file: \"Team offsite photos.zip\"}", violates: false }
      ]
    }
  }
]

/** Words that only appear in the few-shot answers; finding one in a draft for another rule means it was copied. */
export const fewShotVocabulary: ReadonlyArray<string> = [
  "zendesk", "ticket", "helpdesk", "kubernetes", "kubectl", "replica", "autoscal", "platform team", "board deck", "offsite",
  // The template that leaked in production listed these for every rule.
  "wildcard path", "moving, renaming", "renaming, or overwriting"
]
