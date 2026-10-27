const hex = (bytes: Uint8Array): string => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")

/** Chunked, so megabyte inputs do not overflow the argument limit of `String.fromCharCode`. */
export const toBase64 = (bytes: ArrayBuffer | Uint8Array): string => {
  const view = new Uint8Array(bytes)
  let binary = ""
  for (let offset = 0; offset < view.length; offset += 0x8000) binary += String.fromCharCode(...view.subarray(offset, offset + 0x8000))
  return btoa(binary)
}

export const fromBase64 = (text: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(text), (char) => char.charCodeAt(0))

export const sha256Hex = async (input: string): Promise<string> =>
  hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input))))

export const randomHex = (byteLength: number): string => hex(crypto.getRandomValues(new Uint8Array(byteLength)))
