import type { ResourceKind } from "@pc/domain"
import type { ConfigDraft } from "./config-draft"
import { engineInfo } from "./config-fields/database-engines"

const auth = (draft: ConfigDraft) => (draft.authSecretId === "" ? "no authentication" : "authenticated")

/** The defaults an unopened "Advanced" section will apply, in a few words. */
export const advancedSummary = (kind: ResourceKind, draft: ConfigDraft, scope: string): string => {
  switch (kind) {
    case "mcp_server":
      return [scope, draft.transport === "sse" ? "SSE" : "Streamable HTTP", auth(draft)].join(" · ")
    case "api":
      return [scope, draft.allowedMethods.join(" "), auth(draft)].join(" · ")
    case "database":
      return [scope, engineInfo(draft.engine)?.label ?? draft.engine, draft.readOnly ? "read-only" : "writable"].join(" · ")
    case "integration":
      return [scope, draft.limitActions ? `${draft.actions.length} actions` : "all actions"].join(" · ")
    case "skill":
      // The "Write" source; bundle sources summarise with `sourceSummary` in features/skills.
      return [scope, ...(draft.skillArguments.length === 0 ? [] : [`${draft.skillArguments.length} argument${draft.skillArguments.length === 1 ? "" : "s"}`])].join(" · ")
    case "tool":
    case "secret":
    case "variable":
      return scope
  }
}
