import { writeTar } from "../skills/archive/tar"

const encoder = new TextEncoder()

export interface ZipEntry {
  readonly name: string
  readonly content?: string | Uint8Array
  /** Unix mode in the external attributes, e.g. 0o100755, or 0o120777 for a symlink. */
  readonly unixMode?: number
  readonly deflate?: boolean
  /** Lie about the expanded size, as zip bombs do. */
  readonly declaredSize?: number
}

const bytesOf = (content: string | Uint8Array | undefined): Uint8Array =>
  typeof content === "string" ? encoder.encode(content) : content ?? new Uint8Array(0)

const deflateRaw = async (bytes: Uint8Array): Promise<Uint8Array> =>
  new Uint8Array(await new Response(new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer())

/** A minimal zip writer for tests (no CRCs: the reader does not check them). */
export const makeZip = async (entries: ReadonlyArray<ZipEntry>): Promise<Uint8Array> => {
  const locals: Array<Uint8Array> = []
  const centrals: Array<Uint8Array> = []
  let offset = 0
  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const raw = bytesOf(entry.content)
    const data = entry.deflate === true ? await deflateRaw(raw) : raw
    const method = entry.deflate === true ? 8 : 0
    const size = entry.declaredSize ?? raw.length
    const local = new Uint8Array(30 + name.length + data.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(8, method, true)
    lv.setUint32(18, data.length, true)
    lv.setUint32(22, size, true)
    lv.setUint16(26, name.length, true)
    local.set(name, 30)
    local.set(data, 30 + name.length)
    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, (3 << 8) | 20, true)
    cv.setUint16(10, method, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, size, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(38, (entry.unixMode ?? 0o100644) * 0x10000, true)
    cv.setUint32(42, offset, true)
    central.set(name, 46)
    locals.push(local)
    centrals.push(central)
    offset += local.length
  }
  const directorySize = centrals.reduce((size, central) => size + central.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, directorySize, true)
  ev.setUint32(16, offset, true)
  const parts = [...locals, ...centrals, end]
  const out = new Uint8Array(parts.reduce((size, part) => size + part.length, 0))
  parts.reduce((at, part) => (out.set(part, at), at + part.length), 0)
  return out
}

export const gzipBytes = async (bytes: Uint8Array): Promise<Uint8Array> =>
  new Uint8Array(await new Response(new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer())

/** A .tar.gz of regular files. */
export const makeTarGz = (files: ReadonlyArray<{ readonly path: string; readonly content: string; readonly mode?: string }>) =>
  gzipBytes(writeTar(files.map((file) => ({ path: file.path, mode: file.mode ?? "644", bytes: encoder.encode(file.content) }))))

/** A tar header of any type, for links and hostile names the writer would never produce. */
export const tarEntry = (name: string, type: string, content = "", linkName = ""): Uint8Array => {
  const data = encoder.encode(content)
  const header = new Uint8Array(512)
  const put = (value: string, at: number) => header.set(encoder.encode(value), at)
  put(name, 0)
  put("0000644\0", 100)
  put(`${data.length.toString(8).padStart(11, "0")}\0`, 124)
  put(type, 156)
  put(linkName, 157)
  put("ustar\0" + "00", 257)
  const body = new Uint8Array(Math.ceil(data.length / 512) * 512)
  body.set(data)
  const out = new Uint8Array(512 + body.length)
  out.set(header)
  out.set(body, 512)
  return out
}

export const tarOf = (...entries: ReadonlyArray<Uint8Array>): Uint8Array => {
  const parts = [...entries, new Uint8Array(1024)]
  const out = new Uint8Array(parts.reduce((size, part) => size + part.length, 0))
  parts.reduce((at, part) => (out.set(part, at), at + part.length), 0)
  return out
}

export const skillMd = (name: string, description: string, body = "# Steps\n\n1. Do the thing.\n") => `---\nname: ${name}\ndescription: ${description}\n---\n${body}`
