import type { McpCatalogCategory, McpCatalogItem } from "@pc/domain"
import { useState } from "react"
import { matchesQuery } from "@/components/form/search-input"
import { Section } from "@/components/layout/section"
import { SegmentedFilter } from "@/components/layout/segmented-filter"
import { useCan } from "@/features/auth/me-context"
import { CatalogCard } from "./catalog-card"
import { catalogCategories, categoryLabel } from "./categories"

const all = "all"

export const matchesItem = (query: string, { entry }: McpCatalogItem) =>
  matchesQuery(query, [entry.slug, entry.name, entry.vendor, entry.description, categoryLabel[entry.category], ...entry.capabilities])

/** Official servers that connect with one sign-in, first on the Integrations page. */
export function PopularServers({ items, query }: { readonly items: ReadonlyArray<McpCatalogItem>; readonly query: string }) {
  const [category, setCategory] = useState<McpCatalogCategory | typeof all>(all)
  const canManage = useCan("resources:manage")
  const entries = items.map((item) => item.entry)
  const shown = items.filter((item) => (category === all || item.entry.category === category) && matchesItem(query, item))
  if (query.trim() !== "" && shown.length === 0) return null
  return (
    <Section title="Popular" description="Official servers from each vendor. Sign in once and it is live." aside={`${shown.length} of ${items.length}`}>
      <SegmentedFilter
        label="Popular server category"
        value={category}
        onChange={setCategory}
        segments={[
          { value: all, label: "All", count: items.length },
          ...catalogCategories(entries).map((value) => ({ value, label: categoryLabel[value], count: entries.filter((entry) => entry.category === value).length }))
        ]}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {shown.map((item) => (
          <CatalogCard key={item.entry.slug} item={item} canManage={canManage} />
        ))}
      </div>
    </Section>
  )
}
