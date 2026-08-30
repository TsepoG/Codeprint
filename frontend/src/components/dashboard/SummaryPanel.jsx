function SummaryPanel({ narrative }) {
  if (!narrative) return null

  const paragraphs = narrative.summary
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)

  return (
    <section className="blueprint-note" aria-label="AI-generated codebase summary">
      <span className="blueprint-note-tag">AI Synthesis</span>

      {paragraphs.map((paragraph, index) => (
        <p key={index} className="narrative-summary">
          {paragraph}
        </p>
      ))}

      {narrative.gapAnalysis?.length > 0 && (
        <>
          <h3 className="narrative-heading">Gap analysis</h3>
          <ul className="narrative-gap-list">
            {narrative.gapAnalysis.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

export default SummaryPanel
