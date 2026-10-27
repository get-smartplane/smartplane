import { textResult, type ToolResult } from "../../mcp/sdk"

/** Response headers worth showing an agent; cookies and infrastructure headers never are. */
const visibleHeaders = ["content-type", "location", "retry-after", "etag", "last-modified", "link"]

const isTextual = (contentType: string) =>
  contentType === "" || /json|xml|yaml|csv|javascript|x-www-form-urlencoded|^text\//i.test(contentType)

export interface ApiResponse {
  readonly status: number
  readonly headers: Readonly<Record<string, string | undefined>>
  readonly bytes: Uint8Array
  readonly truncated: boolean
}

const bodyOf = (response: ApiResponse, contentType: string): unknown => {
  if (!isTextual(contentType)) return `[${response.bytes.length} bytes of ${contentType} omitted]`
  const text = new TextDecoder().decode(response.bytes)
  if (response.truncated || !/json/i.test(contentType)) return text
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/** The tool result for an upstream HTTP response: status, a few headers and the (possibly truncated) body. */
export const formatResponse = (response: ApiResponse): ToolResult => {
  const contentType = response.headers["content-type"] ?? ""
  const headers = Object.fromEntries(visibleHeaders.flatMap((name) => {
    const value = response.headers[name]
    return value === undefined ? [] : [[name, value]]
  }))
  const payload = {
    status: response.status,
    headers,
    body: bodyOf(response, contentType),
    ...(response.truncated ? { truncated: `body cut at ${response.bytes.length} bytes` } : {})
  }
  return textResult(JSON.stringify(payload, null, 2), response.status >= 400)
}
