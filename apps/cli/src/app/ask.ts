import { Context, Effect, Layer, Stdio } from "effect"
import { Prompt } from "effect/cli"
import { failure, type CliFailure } from "./failure"
import { Host } from "./host"

export interface Choice<A> {
  readonly title: string
  readonly value: A
  readonly description?: string
  readonly selected?: boolean
}

/**
 * Questions a guided command asks. Every question has a stable `id`, so tests answer by id and `--yes` takes
 * each question's default. `interactive` is false without a terminal or in CI: callers must then not ask.
 */
export class Ask extends Context.Service<Ask, {
  readonly interactive: boolean
  readonly confirm: (id: string, message: string, initial: boolean) => Effect.Effect<boolean, CliFailure>
  readonly select: <A>(id: string, message: string, choices: ReadonlyArray<Choice<A>>) => Effect.Effect<A, CliFailure>
  readonly multiSelect: <A>(id: string, message: string, choices: ReadonlyArray<Choice<A>>) => Effect.Effect<ReadonlyArray<A>, CliFailure>
}>()("@pc/cli/Ask") {
  /** effect/cli prompts on the terminal; a closed terminal or Ctrl-C reads as "Cancelled.". */
  static readonly layer = Layer.effect(
    Ask,
    Effect.gen(function*() {
      const host = yield* Host
      const tty = yield* (yield* Stdio.Stdio).stdinIsTerminal
      const context = yield* Effect.context<Prompt.Environment>()
      const run = <A>(prompt: Prompt.Prompt<A>) =>
        Prompt.run(prompt).pipe(Effect.provideContext(context), Effect.mapError(() => failure("Cancelled.")))
      return Ask.of({
        interactive: tty && host.env("CI") === undefined,
        confirm: (_id, message, initial) => run(Prompt.Confirm({ message, initial })),
        select: (_id, message, choices) => run(Prompt.Select({ message, choices: [...choices] })),
        multiSelect: (_id, message, choices) => run(Prompt.MultiSelect({ message, choices: [...choices] }))
      })
    })
  )

  /**
   * Scripted answers for tests: `answers[id]` when set, else the question's default (what `--yes` would take).
   * `asked` records every question id in order.
   */
  static readonly layerScripted = (answers: Readonly<Record<string, unknown>>, asked: Array<string> = []) =>
    Layer.succeed(Ask, Ask.of({
      interactive: true,
      confirm: (id, _message, initial) =>
        Effect.sync(() => {
          asked.push(id)
          const answer = answers[id]
          return typeof answer === "boolean" ? answer : initial
        }),
      select: <A>(id: string, _message: string, choices: ReadonlyArray<Choice<A>>) =>
        Effect.suspend(() => {
          asked.push(id)
          const picked = id in answers ? choices.find((choice) => choice.value === answers[id]) : choices.find((choice) => choice.selected) ?? choices[0]
          return picked === undefined ? Effect.fail(failure(`No scripted answer for "${id}".`)) : Effect.succeed(picked.value)
        }),
      multiSelect: <A>(id: string, _message: string, choices: ReadonlyArray<Choice<A>>) =>
        Effect.sync(() => {
          asked.push(id)
          const answer = answers[id]
          return Array.isArray(answer)
            ? choices.filter((choice) => answer.includes(choice.value)).map((choice) => choice.value)
            : preselected(choices)
        })
    }))
}

export interface Questions {
  /** False under `--yes` or without a terminal: every question then takes its default. */
  readonly live: boolean
  readonly confirm: (id: string, message: string, initial: boolean) => Effect.Effect<boolean, CliFailure>
  readonly select: <A>(id: string, message: string, choices: ReadonlyArray<Choice<A>>) => Effect.Effect<A, CliFailure>
  readonly multiSelect: <A>(id: string, message: string, choices: ReadonlyArray<Choice<A>>) => Effect.Effect<ReadonlyArray<A>, CliFailure>
}

const preselected = <A>(choices: ReadonlyArray<Choice<A>>) => choices.filter((choice) => choice.selected === true).map((choice) => choice.value)

/** Asks when someone is at the keyboard and `--yes` was not given; otherwise answers with each default. */
export const questions = (yes: boolean): Effect.Effect<Questions, never, Ask> =>
  Effect.gen(function*() {
    const ask = yield* Ask
    const live = ask.interactive && !yes
    return {
      live,
      confirm: (id: string, message: string, initial: boolean) => (live ? ask.confirm(id, message, initial) : Effect.succeed(initial)),
      select: <A>(id: string, message: string, choices: ReadonlyArray<Choice<A>>) => {
        if (live) return ask.select(id, message, choices)
        const picked = choices.find((choice) => choice.selected === true) ?? choices[0]
        return picked === undefined ? Effect.fail(failure(`Nothing to choose for "${id}".`)) : Effect.succeed(picked.value)
      },
      multiSelect: <A>(id: string, message: string, choices: ReadonlyArray<Choice<A>>) =>
        live ? ask.multiSelect(id, message, choices) : Effect.succeed(preselected(choices))
    } satisfies Questions
  })
