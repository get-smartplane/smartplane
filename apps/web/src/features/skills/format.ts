const units = ["bytes", "KB", "MB"] as const

/** 5242880 → "5 MB", 1536 → "1.5 KB"; whole numbers drop the decimal. */
export const formatBytes = (bytes: number): string => {
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  const rounded = unit === 0 || value >= 10 ? Math.round(value) : Math.round(value * 10) / 10
  return `${rounded} ${units[unit]}`
}

export const shortSha = (sha: string): string => sha.slice(0, 7)

/** API messages are lower-case fragments ("the archive is larger than 5242880 bytes"); this reads them as sentences. */
export const asSentence = (message: string): string => {
  const humane = message.replace(/(\d{4,}) bytes/g, (_, bytes: string) => formatBytes(Number(bytes)))
  const capitalised = humane.charAt(0).toUpperCase() + humane.slice(1)
  return /[.!?]$/.test(capitalised) ? capitalised : `${capitalised}.`
}

export const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? "" : "s"}`
