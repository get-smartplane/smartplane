/** Activepieces categories are SCREAMING_SNAKE; people read "Developer tools". */
export const categoryLabel = (category: string): string => {
  const words = category.toLowerCase().split("_")
  const sentence = words.join(" ")
  return sentence.charAt(0).toUpperCase() + sentence.slice(1)
}

/** Every category the catalog uses, most common first, so the filter leads with what most pieces share. */
export const categoriesOf = (pieces: ReadonlyArray<{ readonly categories: ReadonlyArray<string> }>): ReadonlyArray<string> => {
  const counts = new Map<string, number>()
  for (const category of pieces.flatMap((piece) => piece.categories)) counts.set(category, (counts.get(category) ?? 0) + 1)
  return [...counts.entries()].sort(([a, x], [b, y]) => y - x || a.localeCompare(b)).map(([category]) => category)
}
