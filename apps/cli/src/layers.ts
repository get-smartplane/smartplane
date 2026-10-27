import { NodeServices } from "@effect/platform-node"
import { Layer } from "effect"
import { FetchHttpClient } from "effect/http"
import { Ask } from "./app/ask"
import { Host } from "./app/host"
import { Output } from "./app/output"
import { Credentials } from "./config/credentials"
import { ChildRunner } from "./run/runner"
import { McpConnection } from "./skills/mcp"

/** Everything commands need from the outside world; tests swap in fakes for HTTP and a temp HOME. */
export const cliLayer = Layer.merge(Credentials.layer, Ask.layer).pipe(
  Layer.provideMerge(Layer.mergeAll(NodeServices.layer, Host.layer, Output.layer, FetchHttpClient.layer, McpConnection.layer, ChildRunner.layer))
)
