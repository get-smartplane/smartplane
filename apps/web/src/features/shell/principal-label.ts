import type { Principal } from "@pc/domain"

const initialsOf = (text: string) =>
  text
    .split(/[\s@._-]+/)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")

export const principalLabel = (principal: Principal) => {
  const name = principal._tag === "User" ? principal.email : principal.name
  const detail = principal._tag === "User" ? principal.role : "Service account"
  return { name, detail, initials: initialsOf(name) || "?" }
}
