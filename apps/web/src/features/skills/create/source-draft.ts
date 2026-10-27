import type { ProjectId } from "@pc/domain"

/** Raw values of the bundle sources' fields; only the chosen source's are sent. */
export interface SourceDraft {
  /** `owner/repo`, `owner/repo/path@ref` or a github.com URL, parsed with `parseGithubSpec`. */
  readonly spec: string
  /** A `secret` resource holding a GitHub token, for private repositories; "" for none. */
  readonly tokenSecretId: string
  readonly url: string
  readonly file: File | null
}

export const emptySourceDraft: SourceDraft = { spec: "", tokenSecretId: "", url: "", file: null }

export type SetSourceDraft = <K extends keyof SourceDraft>(key: K, value: SourceDraft[K]) => void

/** What the shared resource fields contribute to a bundle skill. */
export interface SkillDetails {
  readonly name: string
  readonly description: string
  readonly projectId: ProjectId | null
}
