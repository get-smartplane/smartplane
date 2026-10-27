import { InvalidInput } from "@pc/domain"
import { Result } from "effect"

/** Hostnames that resolve to the machine itself or to cloud metadata services. */
const blockedHosts = /^(?:localhost|.*\.localhost|.*\.local|.*\.internal|.*\.home\.arpa|metadata|metadata\.google\.internal|instance-data)\.?$/i

const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

/** Every IPv4 literal outside public unicast space: loopback, private, CGNAT, link-local (metadata), multicast, ... */
const isPrivateIpv4 = (host: string): boolean => {
  const match = ipv4.exec(host)
  if (match === null) return false
  const [a = 0, b = 0] = match.slice(1, 3).map(Number)
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19))
}

const isIpv6Literal = (host: string): boolean => host.startsWith("[")

/** Decimal, octal and hex IPv4 spellings (`2130706433`, `0x7f.1`) that some resolvers accept. */
const isObfuscatedIpv4 = (host: string): boolean => /^(?:0x[0-9a-f]+|\d+)(?:\.(?:0x[0-9a-f]+|\d+)){0,3}$/i.test(host) && !ipv4.test(host)

const refuse = (message: string) => Result.fail(new InvalidInput({ message, field: "url" }))

/**
 * SSRF screen for URLs the server fetches on a user's behalf: HTTPS on the default port only, no
 * credentials in the URL, and no host that names this network or a metadata service, no IPv6 literal and
 * no IPv4 literal in private or reserved space. Workers cannot resolve DNS before connecting, so names that resolve to private addresses
 * are stopped by Cloudflare's egress (Workers cannot reach private networks without a tunnel), not here.
 * Every redirect target is screened again by the fetcher.
 */
export const screenUrl = (raw: string): Result.Result<URL, InvalidInput> => {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return refuse("not a valid URL")
  }
  if (url.protocol !== "https:") return refuse("only https:// URLs can be fetched")
  if (url.username !== "" || url.password !== "") return refuse("URLs with credentials are not accepted")
  if (url.port !== "" && url.port !== "443") return refuse("only the default HTTPS port is allowed")
  const host = url.hostname.toLowerCase()
  if (blockedHosts.test(host)) return refuse(`"${host}" is not a public host`)
  if (isIpv6Literal(host) || isPrivateIpv4(host) || isObfuscatedIpv4(host)) return refuse("IP-address URLs in private or reserved ranges are not allowed")
  if (!host.includes(".")) return refuse(`"${host}" is not a public host`)
  return Result.succeed(url)
}
