#!/usr/bin/env node
import { NodeRuntime } from "@effect/platform-node"
import { Effect } from "effect"
import { cliLayer } from "./layers"
import { main } from "./main"

NodeRuntime.runMain(main.pipe(Effect.provide(cliLayer)))
