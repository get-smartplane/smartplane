import type { FakeResponse } from "./fake-api"

/** Wire-format delivery replies for `POST /api/secrets/deliver`. */
export const apiKey = "sk_test_FAKE-not-a-r"
export const region = "eu-west-1-region"

export const delivered = (name: string, value: string, kind: "secret" | "variable" = "secret") => ({
  name,
  value,
  kind,
  version: "1",
  resourceId: `res_${name.toLowerCase().replace(/[^a-z0-9]/g, "").padEnd(8, "0")}`
})

export const deliveryReply = (
  env: ReadonlyArray<ReturnType<typeof delivered>> = [delivered("API_KEY", apiKey), delivered("REGION", region, "variable"), delivered("PIN", "1234")],
  denied: ReadonlyArray<{ readonly name: string; readonly reason: string }> = []
): FakeResponse => ({ body: { env, denied, expiresAt: null } })

/** A `node -e` child; the script's output goes through the scrubber like any program's. */
export const node = (script: string) => ["--", process.execPath, "-e", script]
