import type { GuardId } from "@pc/domain"
import { useCallback, useRef, useState } from "react"
import { useMutation } from "@/lib/api/use-mutation"
import { compileGuardAtom, createGuardAtom } from "../atoms"

/** A rule typed in the quick-add row: saving, saved (with its id) or not saved. */
export type QuickRule =
  | { readonly key: number; readonly rule: string; readonly state: "saving" }
  | { readonly key: number; readonly rule: string; readonly state: "added"; readonly id: GuardId }
  | { readonly key: number; readonly rule: string; readonly state: "failed" }

/** The threshold the New rule dialog starts at. */
const DefaultThreshold = 0.7

/**
 * Adds rules typed in a row, each as a draft with no mode chosen (verify sets the one its wording suggests),
 * and starts its verify. The requests go one after another, in the order typed: a mutation atom cancels a
 * call still running when it is called again, and the order keeps the rows where they were typed. The verify
 * runs themselves go on in parallel on the server. Nothing is activated here.
 */
export const useQuickAdd = () => {
  const create = useMutation(createGuardAtom)
  const compile = useMutation(compileGuardAtom)
  const [rules, setRules] = useState<ReadonlyArray<QuickRule>>([])
  const queue = useRef<Promise<void>>(Promise.resolve())
  const nextKey = useRef(0)

  const settle = (key: number, next: QuickRule) => setRules((current) => current.map((rule) => (rule.key === key ? next : rule)))

  const enqueue = useCallback((rule: string, key: number) => {
    queue.current = queue.current.then(async () => {
      const created = await create.execute({ rule, threshold: DefaultThreshold, projectId: null, resourceIds: [] })
      if (created._tag !== "Success") return settle(key, { key, rule, state: "failed" })
      settle(key, { key, rule, state: "added", id: created.value.id })
      // A verify that could not be queued shows as failed on the row, from the server's own state.
      await compile.execute(created.value.id)
    })
  }, [create, compile])

  const add = useCallback((texts: ReadonlyArray<string>) => {
    const added = texts.map((rule) => ({ key: nextKey.current++, rule, state: "saving" as const }))
    setRules((current) => [...current, ...added])
    for (const { rule, key } of added) enqueue(rule, key)
  }, [enqueue])

  const retry = useCallback((key: number) => {
    const failed = rules.find((rule) => rule.key === key)
    if (failed === undefined) return
    settle(key, { key, rule: failed.rule, state: "saving" })
    enqueue(failed.rule, key)
  }, [rules, enqueue])

  const dismiss = useCallback((key: number) => setRules((current) => current.filter((rule) => rule.key !== key)), [])

  return { rules, add, retry, dismiss }
}
