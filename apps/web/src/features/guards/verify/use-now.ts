import { useEffect, useState } from "react"

/** The current time, ticking every second while `live`, for elapsed times. */
export const useNow = (live: boolean): number => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!live) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [live])
  return now
}
