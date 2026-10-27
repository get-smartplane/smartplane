import { Guard, Name, Probability } from "@pc/domain"
import { Effect, Option, Schema } from "effect"
import { Argument, Command, Flag } from "effect/cli"
import { api } from "../../api/client"
import { projectFlag } from "../../app/common-flags"
import { CommaList } from "../../app/flag-values"
import { emit, note } from "../../app/output"
import { resolveProject, resolveResource } from "../../resolve/entities"
import { modeChoices, ruleDetails, ruleTable } from "./describe"
import { activateRule, disableRule, getRule, verifyRule, waitFlag } from "./lifecycle"
import { waitForVerify } from "./wait"
import { testRule } from "./test"

const listRules = Command.make("ls", {}, () =>
  Effect.gen(function*() {
    yield* emit(Schema.Array(Guard), yield* (yield* api).guards.list(), ruleTable)
  })).pipe(Command.withDescription("List guard rules"), Command.withAlias("list"))

const addRule = Command.make("add", {
  rule: Argument.String("sentence").pipe(Argument.withSchema(Schema.NonEmptyString), Argument.withDescription("The rule in plain language")),
  mode: Flag.ChoiceWithValue("mode", modeChoices).pipe(Flag.withDescription("enforce denies, monitor flags, approval holds for a human"), Flag.withDefault("enforce")),
  name: Flag.String("name").pipe(Flag.withSchema(Name), Flag.withDescription("Short name (default: the sentence)"), Flag.optional),
  threshold: Flag.Finite("threshold").pipe(Flag.withSchema(Probability), Flag.withDescription("Trigger at this violation probability"), Flag.withDefault(0.7)),
  resources: Flag.String("resources").pipe(Flag.withSchema(CommaList(Schema.String)), Flag.withDescription("Only these resources (default: all)"), Flag.withDefault([])),
  project: projectFlag,
  skipVerify: Flag.Boolean("skip-verify").pipe(Flag.withDescription("Create the draft without verifying it"), Flag.withDefault(false)),
  wait: waitFlag
}, (flags) =>
  Effect.gen(function*() {
    const client = yield* api
    const projectId = yield* Effect.transposeOption(Option.map(flags.project, resolveProject(client)))
    const resourceIds = yield* Effect.forEach(flags.resources, resolveResource(client))
    const created = yield* client.guards.create({
      payload: {
        // Without --name the API names the rule from its text and keeps the name in step when the text changes.
        ...Option.match(flags.name, { onNone: () => ({}), onSome: (name) => ({ name }) }),
        rule: flags.rule,
        mode: flags.mode,
        threshold: flags.threshold,
        projectId: Option.getOrNull(projectId),
        resourceIds
      }
    })
    const started = flags.skipVerify ? created : yield* client.guards.compile({ params: { id: created.id } }).pipe(
      // The rule exists either way; a queue outage should not hide that.
      Effect.catchTag("UpstreamFailure", (error) => Effect.as(note(`Could not verify yet (${error.message}); run \`smartplane rules verify ${created.id}\` later.`), created))
    )
    const guard = flags.wait && started.verify !== null ? yield* waitForVerify(client, started) : started
    yield* emit(Guard, guard, ruleDetails)
    yield* note(`Rules start as drafts. Review the instructions, try \`smartplane rules test ${guard.id}\`, then \`smartplane rules activate ${guard.id}\`.`)
  })).pipe(
    Command.withDescription("Add a guard rule in plain language; it is verified into a draft classifier prompt"),
    Command.withExamples([{ command: "smartplane rules add \"Nobody deletes reports from the Q3 folder\" --mode approval", description: "Hold matching calls for approval" }])
  )

export const rules = Command.make("rules").pipe(
  Command.withDescription("Plain-language guard rules checked before every agent action"),
  Command.withSubcommands([listRules, getRule, addRule, verifyRule, testRule, activateRule, disableRule])
)
