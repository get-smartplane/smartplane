import { describe, expect, it } from "vitest"
import { apiKey, delivered, deliveryReply, region } from "../../testing/delivery"
import { runCli } from "../../testing/run-cli"
import { dotenvLine } from "./dotenv"

const env = { SMARTPLANE_TOKEN: "pc_test" }
const routes = { "POST /api/secrets/deliver": deliveryReply([delivered("API_KEY", apiKey), delivered("REGION", region, "variable")]) }
const flag = "--i-understand-this-writes-plaintext"

describe("smartplane secrets env", () => {
  it("refuses without the explicit flag, explains why, and fetches nothing", async () => {
    const result = await runCli(["secrets", "env", "--format", "dotenv"], { env, routes })
    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain("plaintext")
    expect(result.stderr).toContain("smartplane run")
    expect(result.stdout).toBe("")
    expect(result.requests).toEqual([])
  })

  it("prints dotenv to stdout with the flag", async () => {
    const result = await runCli(["secrets", "env", flag], { env, routes })
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe(`API_KEY='${apiKey}'\nREGION='${region}'`)
    expect(result.requests[0]?.body).toEqual({ purpose: "run" })
  })

  it("prints JSON with --format json", async () => {
    const result = await runCli(["secrets", "env", "--format", "json", "--only", "API_KEY", flag], { env, routes })
    expect(JSON.parse(result.stdout)).toEqual({ API_KEY: apiKey, REGION: region })
    expect(result.requests[0]?.body).toEqual({ purpose: "run", names: ["API_KEY"] })
  })

  it("quotes awkward values so dotenv parsers read them back", () => {
    expect(dotenvLine("A", "it's")).toBe(`A="it's"`)
    expect(dotenvLine("A", "line1\nline2")).toBe(`A="line1\\nline2"`)
    expect(dotenvLine("A", `it's "x"`)).toBe("A=`it's \"x\"`")
  })
})
