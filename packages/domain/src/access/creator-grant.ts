import type { Resource } from "../resources/resource"
import type { Grant } from "./grant"

/**
 * Whether `grant` is the one a resource's creator receives on creating it: a direct,
 * unconditional, non-expiring `admin` grant to the creator, made by the creator. It is an ordinary grant; this
 * only lets the dashboard explain it ("because you created it") and keep it out of "has anyone been granted".
 */
export const isCreatorGrant = (grant: Grant, resource: Pick<Resource, "id" | "createdBy"> | undefined): boolean =>
  resource !== undefined &&
  grant.resourceId === resource.id &&
  grant.subject.type === "user" &&
  grant.subject.id === resource.createdBy &&
  grant.createdBy === resource.createdBy &&
  grant.action === "admin" &&
  grant.expiresAt === null &&
  grant.conditions.tools === undefined &&
  grant.conditions.arguments === undefined
