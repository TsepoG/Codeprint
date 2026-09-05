import { useEffect, useRef } from 'react'

/**
 * Scrolls the ref'd element into view whenever `key` changes to a new
 * non-null value. Returns the ref to put on whichever element is currently
 * the target.
 *
 * Lives in its own module rather than alongside the components that use it
 * so those files keep exporting only components (react-refresh), and because
 * both the Hotspots files table and the Infrastructure findings table need
 * it for the same "view in context" jump.
 *
 * `scrollIntoView` is guarded because jsdom doesn't implement it - the tests
 * covering highlighting would otherwise throw on an unrelated detail of the
 * test environment.
 *
 * @param {string|null|undefined} key
 */
export function useScrollIntoView(key) {
  const ref = useRef(null)

  useEffect(() => {
    if (!key || !ref.current) return
    if (typeof ref.current.scrollIntoView !== 'function') return
    ref.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [key])

  return ref
}
