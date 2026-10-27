import type { PieceId } from "@pc/domain"

/**
 * Providers that refresh tokens somewhere other than their token URL. Figma exchanges codes at
 * `https://api.figma.com/v1/oauth/token` but refreshes at `/v1/oauth/refresh` (same client authentication).
 */
const refreshUrls: Readonly<Record<string, string>> = {
  figma: "https://api.figma.com/v1/oauth/refresh"
}

/** Where to post `grant_type=refresh_token` for a piece: its override, else the token URL. */
export const refreshUrlFor = (pieceId: PieceId, tokenUrl: string): string => refreshUrls[pieceId] ?? tokenUrl
