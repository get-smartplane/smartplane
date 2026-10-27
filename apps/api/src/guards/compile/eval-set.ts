import { type GuardApprover, type GuardMode, RoleSlug, TeamId, UserId } from "@pc/domain"
import type { OrgDirectory } from "./directory"

/** A small but realistic org for compiler evals: the rules below name its systems, teams and people. */
export const evalDirectory: OrgDirectory = {
  roles: ["owner", "admin", "auditor", "member", "viewer"].map((slug) => RoleSlug.make(slug)),
  teams: [
    { id: TeamId.make("team_finance01"), name: "Finance" },
    { id: TeamId.make("team_security1"), name: "Security" },
    { id: TeamId.make("team_contract1"), name: "Contractors" }
  ],
  members: [
    { userId: UserId.make("usr_founder001"), email: "ian@acme.com", name: "Ian Rumac" },
    { userId: UserId.make("usr_dana00001"), email: "dana@acme.com", name: "Dana Scully" }
  ]
}

export const evalOrgContext = [
  "Resources:",
  "- integration \"Linear\": issue tracker for product and engineering",
  "- mcp_server \"Google Drive\": company drive, includes Reports/Q1..Q4 folders",
  "- integration \"Gmail (billing@acme.com)\": shared billing mailbox",
  "- database \"orders db\": production Postgres with orders and customers",
  "- integration \"GitHub\": acme/web and acme/api repositories",
  "- integration \"Slack\": workspace with #general, #eng, #sales",
  "- integration \"Stripe\": payments and refunds",
  "- integration \"Cloudflare\": DNS and Workers",
  ""
].join("\n")

export interface EvalCase {
  readonly rule: string
  readonly mode: GuardMode
  readonly approvers?: ReadonlyArray<GuardApprover>
  /** Each group must have at least one match in the instructions (case-insensitive). */
  readonly mustMention: ReadonlyArray<ReadonlyArray<string>>
  /** None of these may appear in the instructions. */
  readonly mustNotMention: ReadonlyArray<string>
  /** None of these may appear in any example (e.g. role names when the rule has no role condition). */
  readonly examplesMustNotMention?: ReadonlyArray<string>
  /** Examples mentioning these are near misses the rule does not cover, so they must be labelled allowed. */
  readonly nearMisses?: ReadonlyArray<string>
  /** Every example should mention one of these (the rule's objects or system), so it tests this rule and not a generic one. */
  readonly topic: ReadonlyArray<string>
}

const author: GuardApprover = { _tag: "Author" }
/** The template boilerplate seen in production, wrong for any rule that is not about files. */
const fileBoilerplate = ["wildcard", "renaming", "overwrit"]
const approvalTalk = ["permission", "approv", "sign-off", "sign off"]

export const evalSet: ReadonlyArray<EvalCase> = [
  { rule: "nobody deletes reports from the Q3 folder", mode: "enforce", mustMention: [["delet", "remov"], ["q3"]], mustNotMention: ["owner", "admin"], topic: ["q3", "report"] },
  {
    rule: "nobody creates issues on linear without my permission",
    mode: "require_approval",
    approvers: [author],
    mustMention: [["creat"], ["linear"]],
    mustNotMention: [...fileBoilerplate, "moving", ...approvalTalk, "owner", "admin", "auditor"],
    examplesMustNotMention: ["owner", "admin", "auditor", "wildcard"],
    nearMisses: ["updat", "edit", "comment", "close", "view", "read", "list"],
    topic: ["issue", "linear"]
  },
  { rule: "only finance can send email from billing@", mode: "enforce", mustMention: [["send"], ["billing@"], ["finance"]], mustNotMention: fileBoilerplate, topic: ["billing", "email", "mail", "send"] },
  { rule: "never run DROP or TRUNCATE on the orders db", mode: "enforce", mustMention: [["drop"], ["truncate"], ["orders"]], mustNotMention: fileBoilerplate, topic: ["drop", "truncate", "orders", "select", "delete", "insert", "update", "sql", "query"] },
  { rule: "alert me when anyone exports customer data", mode: "monitor", mustMention: [["export"], ["customer"]], mustNotMention: [...fileBoilerplate, "alert"], topic: ["export", "customer", "orders", "stripe", "download", "dump"] },
  { rule: "contractors can't push to main", mode: "enforce", mustMention: [["push"], ["main"], ["contractor"]], mustNotMention: fileBoilerplate, topic: ["push", "main", "branch", "merge", "commit"] },
  { rule: "no sending emails outside @acme.com", mode: "enforce", mustMention: [["send", "email"], ["acme.com"]], mustNotMention: fileBoilerplate, topic: ["acme.com", "email", "mail", "send", "gmail"] },
  { rule: "ask before posting in #general", mode: "require_approval", approvers: [author], mustMention: [["post", "message"], ["#general", "general"]], mustNotMention: [...fileBoilerplate, ...approvalTalk, "ask"], topic: ["general", "post", "message", "slack"] },
  {
    rule: "agents need an admin's sign-off before deleting customer records",
    mode: "require_approval",
    approvers: [{ _tag: "Role", role: RoleSlug.make("admin") }],
    mustMention: [["delet"], ["customer"]],
    mustNotMention: [...fileBoilerplate, ...approvalTalk],
    topic: ["customer", "record", "delete"]
  },
  {
    rule: "nobody merges pull requests without the security team's approval",
    mode: "require_approval",
    approvers: [{ _tag: "Team", teamId: TeamId.make("team_security1") }],
    mustMention: [["merg"], ["pull request", "pr"]],
    mustNotMention: [...fileBoilerplate, ...approvalTalk],
    topic: ["merge", "pull", "pr", "github"]
  },
  { rule: "let me know when someone shares a Google Drive file publicly", mode: "monitor", mustMention: [["shar", "permission"], ["public", "anyone"]], mustNotMention: ["wildcard", "renaming", "let me know"], topic: ["share", "drive", "file", "public", "permission"] },
  { rule: "nobody except Dana can change DNS records in Cloudflare", mode: "enforce", mustMention: [["dns"], ["dana"]], mustNotMention: fileBoilerplate, topic: ["dns", "record", "cloudflare", "zone"] },
  {
    rule: "refunds over $500 in Stripe need sign-off from finance",
    mode: "require_approval",
    approvers: [{ _tag: "Team", teamId: TeamId.make("team_finance01") }],
    mustMention: [["refund"], ["500"]],
    mustNotMention: [...fileBoilerplate, ...approvalTalk],
    topic: ["refund", "stripe", "charge", "payment"]
  },
  { rule: "watch for any access to the payroll spreadsheet", mode: "monitor", mustMention: [["payroll"]], mustNotMention: fileBoilerplate, topic: ["payroll", "drive", "sheet"] }
]
