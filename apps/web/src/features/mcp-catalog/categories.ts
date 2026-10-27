import type { McpCatalogCategory, McpCatalogEntry } from "@pc/domain"

export const categoryLabel: { readonly [C in McpCatalogCategory]: string } = {
  developer: "Developer tools",
  project_management: "Project management",
  productivity: "Productivity",
  design: "Design",
  payments: "Payments",
  crm: "CRM",
  support: "Support",
  data: "Databases",
  hosting: "Hosting"
}

/** Categories in use, most common first, so the filter leads with what most servers share. */
export const catalogCategories = (entries: ReadonlyArray<McpCatalogEntry>): ReadonlyArray<McpCatalogCategory> => {
  const counts = new Map<McpCatalogCategory, number>()
  for (const { category } of entries) counts.set(category, (counts.get(category) ?? 0) + 1)
  return [...counts.entries()].sort(([a, x], [b, y]) => y - x || a.localeCompare(b)).map(([category]) => category)
}
