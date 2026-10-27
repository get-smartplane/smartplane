/**
 * Pixel-art cloud sprites as a grid of tones; the same generator the marketing site draws its sky with,
 * so the dashboard's clouds are the site's clouds. Pure: a seed always yields the same cloud.
 */
export type Tone = "lit" | "half" | "shade"
type CloudGrid = ReadonlyArray<ReadonlyArray<Tone | null>>

interface Puff {
  readonly x: number
  readonly y: number
  readonly r: number
}

const rng = (seed: number): (() => number) => {
  let s = seed >>> 0 || 1
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296
}

const puffsFor = (seed: number, w: number, h: number): ReadonlyArray<Puff> => {
  const rand = rng(seed)
  const base = h - 1
  const count = 3 + Math.floor(rand() * 2)
  return Array.from({ length: count }, (_, i) => {
    const t = (i + 0.5) / count
    const r = h * (0.42 + rand() * 0.22) * (1.05 - Math.abs(t - 0.5) * 0.9)
    return { x: w * (0.16 + t * 0.68) + (rand() - 0.5) * 2, y: base - r * 0.7, r }
  })
}

const toneAt = (puffs: ReadonlyArray<Puff>, base: number, px: number, py: number): Tone | null => {
  let best: Puff | undefined
  let depth = -1
  for (const p of puffs) {
    const d = Math.hypot(px - p.x, (py - p.y) * 1.1) / p.r
    if (d < 1 && 1 - d > depth) {
      depth = 1 - d
      best = p
    }
  }
  if (!best || py > base) return null
  if (py > base - 1) return "shade"
  const light = -((py - best.y) / best.r) * 0.85 - ((px - best.x) / best.r) * 0.3
  return light > -0.12 ? "lit" : light > -0.5 ? "half" : "shade"
}

/** A w×h grid; each puff is a ball lit from the upper left: a lit cap, a half-tone shoulder, a cooler underside. */
const pixelCloud = (seed: number, w: number, h: number): CloudGrid => {
  const puffs = puffsFor(seed, w, h)
  return Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => toneAt(puffs, h - 1, x + 0.5, y + 0.5)))
}

/** One SVG path per tone, merging horizontal runs so a cloud is three elements, not hundreds. */
export const cloudPaths = (seed: number, w: number, h: number): Readonly<Record<Tone, string>> => {
  const out: Record<Tone, string> = { lit: "", half: "", shade: "" }
  pixelCloud(seed, w, h).forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const tone = row[x]
      let end = x + 1
      while (end < row.length && row[end] === tone) end++
      if (tone) out[tone] += `M${x} ${y}h${end - x}v1h${x - end}z`
      x = end
    }
  })
  return out
}
