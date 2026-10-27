import { Effect } from "effect"

const base64Url = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

/** RFC 7636 code verifier: 32 random bytes, base64url (43 characters). */
export const codeVerifier = Effect.sync(() => base64Url(crypto.getRandomValues(new Uint8Array(32))))

/** An unguessable `state` binding the provider's redirect to one pending authorization. */
export const oauthState = Effect.sync(() => base64Url(crypto.getRandomValues(new Uint8Array(24))))

export const codeChallenge = (verifier: string, method: "plain" | "S256"): Effect.Effect<string> =>
  method === "plain"
    ? Effect.succeed(verifier)
    : Effect.promise(async () => base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)))))
