import { useEffect, useState, type RefObject } from "react"

/** Whether the element is on screen, so ambient loops can pause when it is not. */
export const useInView = (ref: RefObject<Element | null>): boolean => {
  const [inView, setInView] = useState(true)
  useEffect(() => {
    const element = ref.current
    if (element === null) return
    const observer = new IntersectionObserver(([entry]) => setInView(entry?.isIntersecting ?? true))
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return inView
}
