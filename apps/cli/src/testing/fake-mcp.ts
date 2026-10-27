import type { McpResources } from "../skills/mcp"

export interface FakeFile {
  readonly path: string
  readonly text?: string
  readonly bytes?: Uint8Array
  readonly mode?: "644" | "755"
}

export interface FakeSkill {
  readonly slug: string
  readonly description: string
  readonly version?: string
  readonly files: ReadonlyArray<FakeFile>
  readonly arguments?: ReadonlyArray<{ readonly name: string; readonly description?: string; readonly required?: boolean }>
}

const uriOf = (slug: string, path: string) => (path === "SKILL.md" ? `skill://${slug}` : `skill://${slug}/${path}`)

/**
 * A gateway speaking the skill-folder contract as wire JSON. `legacy` mimics servers that only serve
 * `skill://<slug>` with no `_meta`. `reads` counts `resources/read` calls per URI.
 */
/** What every gateway serves to everyone, granted or not. */
export const builtinTools = ["skills_list", "skills_get", "variables_get"]

export const toolList = (names: ReadonlyArray<string>) => ({ tools: names.map((name) => ({ name, inputSchema: { type: "object" } })) })

export const fakeMcp = (
  skills: () => ReadonlyArray<FakeSkill>,
  options: { readonly legacy?: boolean; readonly tools?: ReadonlyArray<string> } = {}
) => {
  const reads = new Map<string, number>()
  const meta = (skill: FakeSkill, file: FakeFile) =>
    options.legacy ? {} : {
      _meta: {
        "smartplane.dev/skill": skill.slug,
        "smartplane.dev/path": file.path,
        "smartplane.dev/mode": file.mode ?? "644",
        "smartplane.dev/version": skill.version ?? "v0"
      }
    }
  const entries = () =>
    skills().flatMap((skill) =>
      skill.files
        .filter((file) => !options.legacy || file.path === "SKILL.md")
        .map((file) => ({ skill, file, uri: uriOf(skill.slug, file.path) })))
  const mcp: McpResources = {
    listResources: async () => ({
      resources: entries().map(({ file, skill, uri }) => ({
        uri,
        name: skill.slug,
        description: skill.description,
        mimeType: file.bytes === undefined ? "text/markdown" : "application/octet-stream",
        ...meta(skill, file)
      }))
    }),
    listPrompts: async () => ({ prompts: skills().map((skill) => ({ name: skill.slug, arguments: skill.arguments ?? [] })) }),
    listTools: async () => toolList([...builtinTools, ...(options.tools ?? [])]),
    readResource: async (uri) => {
      reads.set(uri, (reads.get(uri) ?? 0) + 1)
      const found = entries().find((entry) => entry.uri === uri)
      if (found === undefined) throw new Error(`Resource ${uri} not found`)
      const { file, skill } = found
      const body = file.bytes === undefined ? { text: file.text ?? "" } : { blob: Buffer.from(file.bytes).toString("base64") }
      return { contents: [{ uri, mimeType: "text/plain", ...body, ...meta(skill, file) }] }
    }
  }
  return { mcp, reads }
}
