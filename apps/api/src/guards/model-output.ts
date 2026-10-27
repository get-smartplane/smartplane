/**
 * Workers AI chat models sometimes wrap JSON answers in a ```json fence even with a JSON schema set. This
 * strips the fence from `response` or `choices[0].message.content` so the caller's schema can decode it;
 * anything else passes through unchanged for the schema to reject.
 */
export const unfenceModelOutput = (raw: unknown): unknown => {
  const unfence = (text: unknown) => (typeof text === "string" ? text.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/, "$1") : text)
  if (typeof raw !== "object" || raw === null) return raw
  if ("response" in raw) return { ...raw, response: unfence(raw.response) }
  if (!("choices" in raw) || !Array.isArray(raw.choices)) return raw
  return {
    ...raw,
    choices: raw.choices.map((choice: unknown) =>
      typeof choice === "object" && choice !== null && "message" in choice && typeof choice.message === "object" && choice.message !== null && "content" in choice.message
        ? { ...choice, message: { ...choice.message, content: unfence(choice.message.content) } }
        : choice
    )
  }
}
