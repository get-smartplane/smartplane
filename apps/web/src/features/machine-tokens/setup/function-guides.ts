import { envLines, sdkComingSoon, type SetupContext, type SetupGuide } from "./types"

const lines = (...text: ReadonlyArray<string>) => text.join("\n")

/**
 * Vercel: `vercel env add NAME production` prompts for the value and stores Production variables as Secret
 * by default; changes apply to new deployments only. Functions have no start command, so values load at
 * module scope, once per cold start; Fluid compute reuses a warm instance across invocations.
 * `vercel env add` options: https://vercel.com/docs/cli/env. Deployments: https://vercel.com/docs/environment-variables.
 * Instance reuse: https://vercel.com/docs/fluid-compute
 */
export const vercelGuide = (context: SetupContext): SetupGuide => ({
  id: "vercel",
  label: "Vercel",
  blocks: [
    {
      where: "Add the token as a Production secret (the CLI asks for the value), then redeploy",
      code: lines(
        "vercel env add SMARTPLANE_TOKEN production",
        ...(context.apiUrl ? [`vercel env add SMARTPLANE_API_URL production --value ${context.apiUrl} --no-sensitive --yes`] : [])
      )
    },
    {
      where: "lib/secrets.ts: starts loading once per cold start",
      code: lines(
        `import { loadSecrets } from "@smartplane/secrets"`,
        "",
        "export const secretsReady = loadSecrets()",
        "secretsReady.catch(() => {}) // handlers still see the error; this stops an early crash"
      )
    },
    {
      where: "In each route or server action that reads a value",
      code: lines(
        `import { secretsReady } from "@/lib/secrets"`,
        "",
        "export async function POST(request: Request) {",
        "  await secretsReady // process.env has the values from here on",
        "}"
      )
    },
    { where: "Only if the build needs secrets, with the smartplane CLI installed in the build: Build Command", code: "smartplane run -- next build" }
  ],
  notes: [
    sdkComingSoon,
    "A warm instance keeps the values until it is recycled, so a rotated secret arrives at the next cold start. Pass refreshEvery to loadSecrets to pick it up sooner.",
    "The dashboard works too: Settings → Environment Variables → Add, Production, type Secret."
  ]
})

/**
 * Cloudflare Workers: `wrangler secret put NAME` prompts for the value and deploys a new version at once.
 * Secrets arrive on the handler's `env` (in `process.env` only with nodejs_compat), and an isolate may be
 * evicted at any time, so values are cached per isolate and fetched inside the handler.
 * Sources: https://developers.cloudflare.com/workers/configuration/secrets/,
 * https://developers.cloudflare.com/workers/runtime-apis/nodejs/process/,
 * https://developers.cloudflare.com/workers/reference/how-workers-works/
 */
export const workersGuide = (context: SetupContext): SetupGuide => ({
  id: "cloudflare-workers",
  label: "Cloudflare Workers",
  blocks: [
    {
      where: context.apiUrl ? `Store the token (Wrangler asks for the value); add SMARTPLANE_API_URL=${context.apiUrl} under vars` : "Store the token (Wrangler asks for the value)",
      code: "npx wrangler secret put SMARTPLANE_TOKEN"
    },
    {
      where: "Worker entry: fetch once per isolate, read inside the handler",
      code: lines(
        `import { createSecretsCache } from "@smartplane/secrets"`,
        "",
        "const secrets = createSecretsCache({ maxAgeMs: 5 * 60_000 })",
        "",
        "export default {",
        `  async fetch(request: Request, env: { SMARTPLANE_TOKEN: string${context.apiUrl ? "; SMARTPLANE_API_URL: string" : ""} }) {`,
        `    const values = await secrets.get({ token: env.SMARTPLANE_TOKEN${context.apiUrl ? ", apiUrl: env.SMARTPLANE_API_URL" : ""} })`,
        "    // values.STRIPE_KEY, values.DATABASE_URL, …",
        "  }",
        "}"
      )
    }
  ],
  notes: [
    sdkComingSoon,
    "A Worker has no start command and gets secrets through env, not process.env, so smartplane run does not apply here.",
    "Isolates can be evicted at any time: a new one fetches again. A failed refetch keeps serving the last values, except after a 401 or 403."
  ]
})

/** Any Node or Bun service with a start command it controls; see packages/secrets-sdk/README.md. */
export const nodeGuide = (context: SetupContext): SetupGuide => ({
  id: "node",
  label: "Node SDK",
  blocks: [
    { where: "The service's environment, through its platform's secret settings", code: envLines(context).join("\n") },
    {
      where: "Entry file: load before anything reads process.env",
      code: lines(
        `import { loadSecrets } from "@smartplane/secrets"`,
        "",
        `await loadSecrets() // reads SMARTPLANE_TOKEN, purpose "boot"`,
        `const { default: app } = await import("./app.mjs")`,
        "app.listen(process.env.PORT)"
      )
    }
  ],
  notes: [sdkComingSoon, "Without the SDK, wrap the start command instead: smartplane run --purpose boot -- node server.js."]
})
