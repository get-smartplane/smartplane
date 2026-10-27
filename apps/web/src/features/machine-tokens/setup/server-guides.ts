import { envLines, type SetupContext, type SetupGuide } from "./types"

/** Said once per tab that types the token on a command line. */
const historyNote = "A command with the token in it lands in your shell history; the platform's dashboard avoids that."

const wrapped = "smartplane run --purpose boot -- <your start command>"

/**
 * Railway: variables are set per service in the dashboard or with `railway variable set NAME=VALUE` (the
 * older `railway variables --set` still works). The start command is a service setting, or `deploy.startCommand` in
 * railway.json. Sources: https://docs.railway.com/cli/variable, https://docs.railway.com/guides/variables,
 * https://docs.railway.com/reference/config-as-code
 */
export const railwayGuide = (context: SetupContext): SetupGuide => ({
  id: "railway",
  label: "Railway",
  blocks: [
    { where: "Service → Variables (or the CLI below). Then delete the real secrets stored there.", code: envLines(context).join("\n") },
    { where: "Or with the Railway CLI, in the linked project", code: `railway variable set ${envLines(context).join(" ")}` },
    { where: "Settings → Deploy → Custom Start Command, or deploy.startCommand in railway.json", code: wrapped }
  ],
  notes: ["The service needs the smartplane CLI on PATH, or use npx smartplane run … in a Node service.", historyNote]
})

/**
 * Fly.io: `fly secrets set NAME=VALUE` (or `fly secrets import`, which reads NAME=VALUE lines from stdin)
 * redeploys the app's Machines; `--stage` skips that. The start command is the Dockerfile's CMD, a
 * `[processes]` entry, or `[experimental] cmd` in fly.toml. Sources: https://docs.fly.io/flyctl/secrets-set,
 * https://docs.fly.io/flyctl/secrets-import, https://docs.fly.io/reference/configuration/
 */
export const flyGuide = (context: SetupContext): SetupGuide => ({
  id: "fly",
  label: "Fly.io",
  blocks: [
    { where: "Set the secret; this redeploys the app's Machines unless you add --stage", code: `fly secrets set ${envLines(context).join(" ")}` },
    { where: "fly.toml: wrap the start command", code: `[processes]\n  app = "${wrapped}"` }
  ],
  notes: ["The image needs the smartplane CLI on PATH. Then remove the real secrets with fly secrets unset.", historyNote]
})

/**
 * Docker: `-e NAME` with no value passes the host's variable into the container, so the token is not in
 * the command line. Source: https://docs.docker.com/reference/cli/docker/container/run/#env
 */
export const dockerGuide = (context: SetupContext): SetupGuide => ({
  id: "docker",
  label: "Docker",
  blocks: [
    { where: "Dockerfile, with the smartplane CLI installed in the image", code: `CMD ["smartplane", "run", "--purpose", "boot", "--", "node", "server.js"]` },
    {
      where: "Run it; -e NAME passes the variable from your shell, so it is not in the docker command",
      code: [`export ${envLines(context).join(" ")}`, `docker run ${envLines(context).map((line) => `-e ${line.split("=")[0]}`).join(" ")} your-image`].join("\n")
    }
  ],
  notes: ["Never bake the token into the image (ENV or ARG): anyone with the image could read it.", historyNote]
})
