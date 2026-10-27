import type { IntegrationAuthType, PieceAuth } from "@pc/domain"

export interface MethodMeta {
  readonly label: string
  readonly description: string
}

/** How each connection method reads in a picker; a piece's own label wins where it says more ("GitHub App"). */
export const methodMeta = (auth: PieceAuth, pieceName: string): MethodMeta => {
  switch (auth.type) {
    case "oauth2":
      return { label: `Sign in with ${pieceName}`, description: "Uses your OAuth app. Tokens refresh on their own." }
    case "secret_text":
      return { label: auth.displayName || "API key", description: "Paste a key or token." }
    case "basic":
      return { label: "Username and password", description: "Stored encrypted as one secret." }
    case "custom":
      return { label: auth.displayName || "Credentials", description: `${auth.fields.length} ${auth.fields.length === 1 ? "field" : "fields"}, stored encrypted.` }
  }
}

/** Short words for a catalog card or a resource row. */
export const authTypeLabel: { readonly [T in IntegrationAuthType]: string } = {
  none: "No sign-in",
  secret_text: "API key",
  basic: "Password",
  custom: "Credentials",
  oauth2: "OAuth"
}
