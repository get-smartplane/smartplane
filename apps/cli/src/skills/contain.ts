import { Effect, FileSystem, Option, Path } from "effect"
import { failure } from "../app/failure"
import { isSafePath } from "./paths"

/**
 * Containment for everything sync writes or removes. The skills directory sits in a repository that anyone with
 * commit access controls, so neither its manifest nor its layout is trusted: a `..` key or a symbolic link
 * swapped in for a folder must never let sync write or delete outside the skills directory.
 */

/** `readlink(2)` never follows the last component, so it answers what `lstat` would: is this path itself a link? */
export const isSymlink = (path: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    return yield* fs.readLink(path).pipe(Effect.as(true), Effect.orElseSucceed(() => false))
  })

/** `path` with its existing ancestors resolved through `realpath`; the missing tail is kept as written. */
const realExisting = (path: string): Effect.Effect<string, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const paths = yield* Path.Path
    const real = yield* fs.realPath(path).pipe(Effect.option)
    if (Option.isSome(real)) return real.value
    const parent = paths.dirname(path)
    return parent === path ? path : paths.join(yield* realExisting(parent), paths.basename(path))
  })

const refuse = (path: string, why: string) =>
  failure(`Refusing to sync skills: ${path} ${why}.`, "Smartplane never writes or deletes through symbolic links. Replace the link with a real folder.")

/**
 * The real skills directory sync works in. Under `--global` the directory lives in the user's own home, so a
 * link there was put there by the user (dotfiles) and is followed once, here. In a project the layout comes from
 * the repository, so any link between the git root and the skills directory is refused.
 */
export const skillsRoot = Effect.fn("Skills.root")(function*(base: string, dir: string, followLinks: boolean) {
  const paths = yield* Path.Path
  if (!followLinks) {
    let current = base
    for (const segment of paths.relative(base, dir).split(paths.sep)) {
      current = paths.join(current, segment)
      if (yield* isSymlink(current)) return yield* refuse(current, "is a symbolic link inside the project")
    }
  }
  return yield* realExisting(dir)
})

/**
 * The absolute path of `relative` (a `/`-separated path) under `root`, after checking that no component of it,
 * nor the root, is a symbolic link and that its real location is still inside the root. Called right before every
 * write and remove so a link planted after the scan is still caught.
 */
export const containedPath = Effect.fn("Skills.containedPath")(function*(root: string, relative: string) {
  const paths = yield* Path.Path
  if (!isSafePath(relative)) return yield* refuse(relative, "is not a safe relative path")
  if (yield* isSymlink(root)) return yield* refuse(root, "is a symbolic link")
  let current = root
  for (const segment of relative.split("/")) {
    current = paths.join(current, segment)
    if (yield* isSymlink(current)) return yield* refuse(current, "is a symbolic link")
  }
  const real = yield* realExisting(current)
  if (real !== root && !real.startsWith(`${root}${paths.sep}`)) return yield* refuse(current, `resolves outside ${root}`)
  return current
})
