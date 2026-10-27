import type { SkillSource } from "./skill-source"
import type { SourceDraft } from "./source-draft"

/** The folded "Advanced options" line for a bundle skill: where it is visible and how GitHub is read. */
export const sourceSummary = (source: SkillSource, draft: SourceDraft, scope: string): string =>
  source === "github" ? [scope, draft.tokenSecretId === "" ? "public repository" : "private repository"].join(" · ") : scope
