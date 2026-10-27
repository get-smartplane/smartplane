const Block = 512
const decoder = new TextDecoder()

const field = (block: Uint8Array, offset: number, length: number): string => {
  const bytes = block.subarray(offset, offset + length)
  const end = bytes.indexOf(0)
  return decoder.decode(end === -1 ? bytes : bytes.subarray(0, end))
}

const paxPath = (data: Uint8Array): string | undefined => /(?:^|\n)\d+ path=(.*)\n/.exec(decoder.decode(data))?.[1]

/**
 * Reads the tar the bundle endpoint writes (ustar, with pax headers for paths over 100 bytes) into
 * path → bytes. Only regular files are kept; sizes are bounded by the input.
 */
export const readTar = (tar: Uint8Array): ReadonlyMap<string, Uint8Array> => {
  const files = new Map<string, Uint8Array>()
  let longPath: string | undefined
  for (let offset = 0; offset + Block <= tar.length; ) {
    const header = tar.subarray(offset, offset + Block)
    if (header.every((byte) => byte === 0)) break
    const size = Number.parseInt(field(header, 124, 12).trim() || "0", 8)
    if (!Number.isSafeInteger(size) || size < 0) break
    const data = tar.subarray(offset + Block, offset + Block + size)
    const type = field(header, 156, 1)
    const prefix = field(header, 345, 155)
    const name = prefix === "" ? field(header, 0, 100) : `${prefix}/${field(header, 0, 100)}`
    if (type === "x") longPath = paxPath(data)
    else if (type === "0" || type === "") {
      files.set(longPath ?? name, data)
      longPath = undefined
    }
    offset += Block + Math.ceil(size / Block) * Block
  }
  return files
}

export const gunzip = async (bytes: Uint8Array): Promise<Uint8Array> =>
  new Uint8Array(await new Response(new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer())
