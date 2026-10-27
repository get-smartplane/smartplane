import type { Guard, ResourceId } from "@pc/domain"

/** "Notion database": the product the pin lives in (from verify's targets), then what it is. */
export const pinKind = (guard: Guard, resourceId: ResourceId, kind: string): string => {
  const product = guard.compiled?.grounding?.targets.find((target) => target.resourceId === resourceId)?.product
  const what = kind.replace(/_/g, " ").toLowerCase()
  return product === undefined || what.toLowerCase().includes(product.toLowerCase()) ? what : `${product} ${what}`
}
