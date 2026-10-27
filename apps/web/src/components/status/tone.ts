/**
 * The meaning behind every status colour in the app. Colour is never decorative:
 * success = allowed, active, intact; warning = pending, draft, held; danger = denied, broken, removed;
 * info = observing without blocking; neutral = inert (expired, disabled, routine events).
 */
export type Tone = "success" | "warning" | "danger" | "info" | "neutral"

export const toneDot: { readonly [T in Tone]: string } = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  info: "bg-info",
  neutral: "bg-muted-foreground/50"
}

export const toneBadge: { readonly [T in Tone]: "success" | "warning" | "destructive" | "info" | "secondary" } = {
  success: "success",
  warning: "warning",
  danger: "destructive",
  info: "info",
  neutral: "secondary"
}
