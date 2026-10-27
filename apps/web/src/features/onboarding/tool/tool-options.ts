import { Database, Server, type LucideIcon } from "lucide-react"

/** Pieces most teams start with that have no official MCP server in the catalog. */
export const popularPieces = ["slack", "google-drive"] as const
export type PopularPiece = (typeof popularPieces)[number]

/** An official MCP server from the catalog, by slug. */
export type ServerChoice = `server:${string}`

export type ToolChoice = ServerChoice | PopularPiece | "postgres" | "mcp"

/** How many catalog servers the step shows before "More…". */
export const topServerCount = 6

export interface ToolOption {
  readonly id: ToolChoice
  readonly name: string
  readonly blurb: string
  /** Pieces show their logo from the catalog; the rest an icon. */
  readonly icon?: LucideIcon
}

export const otherOptions: ReadonlyArray<ToolOption> = [
  { id: "slack", name: "Slack", blurb: "Messages and channels" },
  { id: "google-drive", name: "Google Drive", blurb: "Files and folders" },
  { id: "postgres", name: "Postgres", blurb: "Read-only SQL", icon: Database },
  { id: "mcp", name: "MCP server", blurb: "Any server, by its URL", icon: Server }
]

export const serverChoice = (slug: string): ServerChoice => `server:${slug}`

/** The catalog slug of a server choice, or null. */
export const serverSlugOf = (choice: ToolChoice): string | null => (choice.startsWith("server:") ? choice.slice("server:".length) : null)

export const isPiece = (choice: ToolChoice): choice is PopularPiece => (popularPieces as ReadonlyArray<string>).includes(choice)
