import { useEffect, useState } from 'react'

/**
 * Animates from 0 to `target` over `duration` ms with an ease-out cubic
 * curve. Ported from the mission-control mockup's useCountUp - drives
 * HealthDial's number and ring.
 *
 * @param {number} target
 * @param {number} [duration]
 * @returns {number}
 */
export function useCountUp(target, duration = 900) {
  const [value, setValue] = useState(0)

  useEffect(() => {
    let raf
    let start
    const step = (ts) => {
      if (!start) start = ts
      const p = Math.min((ts - start) / duration, 1)
      setValue(target * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  return value
}
