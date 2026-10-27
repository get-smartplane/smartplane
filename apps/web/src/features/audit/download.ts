/** Saves text the API returned as a file; nothing is fetched here. */
export const downloadText = (text: string, filename: string, type: string) => {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
