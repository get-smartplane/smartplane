/**
 * Aho-Corasick over bytes: one pass over the output finds every occurrence of every pattern, in O(text +
 * matches), however many secrets there are. The automaton's state after a byte is also the longest suffix of
 * the text so far that is still a prefix of some pattern, which is exactly how much the scrubber must hold back.
 */
export interface Automaton {
  /** The state after reading `byte` in `state`; 0 is the root. */
  readonly next: (state: number, byte: number) => number
  /** How many trailing bytes of the text the state stands for. */
  readonly depth: (state: number) => number
  /** Indices of the patterns that end at this state, longest first. */
  readonly matches: (state: number) => ReadonlyArray<number>
}

export const buildAutomaton = (patterns: ReadonlyArray<Uint8Array>): Automaton => {
  const children: Array<Map<number, number>> = [new Map()]
  const depth: Array<number> = [0]
  const fail: Array<number> = [0]
  const output: Array<Array<number>> = [[]]

  patterns.forEach((pattern, index) => {
    let state = 0
    for (const byte of pattern) {
      const node = children[state] ?? new Map<number, number>()
      let child = node.get(byte)
      if (child === undefined) {
        child = children.length
        node.set(byte, child)
        children.push(new Map())
        depth.push((depth[state] ?? 0) + 1)
        fail.push(0)
        output.push([])
      }
      state = child
    }
    output[state]?.push(index)
  })

  const step = (from: number, byte: number): number => {
    let state = from
    while (state !== 0 && !(children[state]?.has(byte) ?? false)) state = fail[state] ?? 0
    return children[state]?.get(byte) ?? 0
  }

  // Breadth-first, so every failure target (a shallower state) is finished before the states that point to it.
  const queue: Array<number> = [...(children[0]?.values() ?? [])]
  for (let head = 0; head < queue.length; head++) {
    const state = queue[head] ?? 0
    for (const [byte, child] of children[state] ?? []) {
      const target = state === 0 ? 0 : step(fail[state] ?? 0, byte)
      fail[child] = target
      output[child] = [...(output[child] ?? []), ...(output[target] ?? [])]
      queue.push(child)
    }
  }

  return {
    next: step,
    depth: (state) => depth[state] ?? 0,
    matches: (state) => output[state] ?? []
  }
}
