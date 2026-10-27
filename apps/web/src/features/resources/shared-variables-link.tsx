import { Link } from "@tanstack/react-router"
import { Braces, ChevronRight } from "lucide-react"
import { useQueryData } from "@/components/query/use-query-data"
import { allResourcesAtom } from "./atoms"

const phrase = (secrets: number, variables: number) =>
  [secrets > 0 && `${secrets} ${secrets === 1 ? "secret" : "secrets"}`, variables > 0 && `${variables} ${variables === 1 ? "variable" : "variables"}`]
    .filter(Boolean)
    .join(" and ")

/**
 * Members without `resources:manage` have no sidebar entry for Secrets & variables, yet may hold grants on
 * variables and on deliverable secrets; this is their way to them. Absent when there is nothing to show.
 */
export function SharedVariablesLink() {
  const resources = useQueryData(allResourcesAtom, [])
  const secrets = resources.filter((resource) => resource.config.kind === "secret").length
  const variables = resources.filter((resource) => resource.config.kind === "variable").length
  if (secrets + variables === 0) return null
  return (
    <Link
      to="/secrets"
      className="group flex w-fit items-center gap-2 rounded-md text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Braces className="size-4" strokeWidth={1.75} />
      <span>{phrase(secrets, variables)} shared with you</span>
      <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  )
}
