import { useEffect, useRef } from 'react'

/**
 * The slide-in detail panel shell - a spec sheet pinned over the drawing.
 *
 * Owns the chrome and the dismissal behaviour (Escape, backdrop, close
 * button, focus handling) so every panel in the dashboard behaves
 * identically; callers supply the title block's text and the body.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {string} [props.tag] Stencilled label above the title.
 * @param {string} props.title
 * @param {string} [props.subtitle] Small monospace line under the title.
 * @param {string} [props.blurb] A sentence explaining what the panel lists.
 * @param {() => void} props.onClose
 * @param {import('react').ReactNode} props.children
 */
function DetailPanel({ open, tag = 'Detail', title, subtitle, blurb, onClose, children }) {
  const closeButtonRef = useRef(null)
  // Where focus was before the panel took it, so closing puts the user back
  // on the control they opened it from rather than at the top of the document.
  const previouslyFocusedRef = useRef(null)

  useEffect(() => {
    if (!open) return

    previouslyFocusedRef.current = document.activeElement
    closeButtonRef.current?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      const previous = previouslyFocusedRef.current
      if (previous && typeof previous.focus === 'function' && document.contains(previous)) previous.focus()
    }
    // Deliberately keyed on `open` alone: a panel that swaps subject (module
    // -> module, via an import link) stays mounted, so focus isn't yanked
    // back to the close button on every hop.
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      {/* Click-outside-to-close. The panel is not a focus trap, so this
          stays a plain overlay rather than something that can take focus. */}
      <div className="panel-backdrop" onClick={onClose} aria-hidden="true" />

      <aside className="detail-panel" role="dialog" aria-modal="true" aria-labelledby="detail-panel-title">
        <header className="detail-panel-head">
          <div className="detail-panel-titleblock">
            <span className="detail-panel-tag">{tag}</span>
            <h2 id="detail-panel-title">{title}</h2>
            {subtitle && <p className="detail-panel-subtitle">{subtitle}</p>}
          </div>
          <button
            type="button"
            className="detail-panel-close"
            onClick={onClose}
            ref={closeButtonRef}
            aria-label="Close detail panel"
          >
            ×
          </button>
        </header>

        {blurb && <p className="detail-panel-blurb">{blurb}</p>}

        <div className="detail-panel-body">{children}</div>
      </aside>
    </>
  )
}

export default DetailPanel
