import { useRef, useEffect } from 'react'

export function useAnimationFrame(callback: () => void, isActive: boolean) {
  const rafId = useRef<number>(0)
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    if (!isActive) return

    function loop() {
      callbackRef.current()
      rafId.current = requestAnimationFrame(loop)
    }

    rafId.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafId.current)
  }, [isActive])
}
