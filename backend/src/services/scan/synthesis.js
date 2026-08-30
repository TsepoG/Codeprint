const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-5';
const SYNTHESIS_TIMEOUT_MS = Number(process.env.SCAN_SYNTHESIS_TIMEOUT_MS) || 30_000;
const MAX_DIGEST_FILES = 20;
const MAX_GAP_ITEMS = 5;

/**
 * @typedef {object} ScanNarrative
 * @property {string} summary Plain-English, 2-3 paragraphs.
 * @property {string[]} gapAnalysis 3-5 bullet-point risks/recommendations.
 */

/**
 * Turns a normalized scan result into a short plain-English narrative via
 * the Claude API: an overall health summary plus a bulleted gap analysis
 * of the top risks/recommendations.
 *
 * Best-effort and silent on failure by design - a scan's usefulness never
 * depends on this. Returns `null` (never throws) if `ANTHROPIC_API_KEY`
 * isn't set, the request errors or times out, or the response can't be
 * parsed into the expected shape. Runs host-side (never inside the
 * sandboxed scan container, which has no network access during analysis
 * and should never see this API key) - see routes/scan.js.
 *
 * @param {ReturnType<typeof import('./normalize.js').normalizeScanResults>} result
 * @returns {Promise<ScanNarrative|null>}
 */
export async function synthesizeNarrative(result) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SYNTHESIS_TIMEOUT_MS);

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
        max_tokens: 1024,
        messages: [{ role: 'user', content: buildPrompt(result) }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn(`Narrative synthesis skipped: Claude API responded with ${response.status}`);
      return null;
    }

    const data = await response.json();
    const text = data.content?.find((block) => block.type === 'text')?.text;
    return text ? parseNarrative(text) : null;
  } catch (err) {
    console.warn('Narrative synthesis skipped:', err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Condenses the (potentially large) scan result into a small digest for
 * the prompt - aggregate metrics plus only the highest-complexity/severity
 * files, rather than the full `files` array or the raw dependency graph.
 *
 * @param {ReturnType<typeof import('./normalize.js').normalizeScanResults>} result
 * @returns {object}
 */
function buildDigest(result) {
  const files = result.files ?? [];
  const topFiles = [...files]
    .sort((a, b) => (b.complexity || 0) - (a.complexity || 0))
    .slice(0, MAX_DIGEST_FILES)
    .map((file) => ({ name: file.name, complexity: file.complexity, severity: file.severity }));

  return {
    metrics: result.metrics,
    fileCount: files.length,
    dependencyEdgeCount: result.dependencyGraph?.edges?.length ?? 0,
    topFilesByComplexity: topFiles,
    toolWarnings: result.warnings ?? [],
  };
}

/** @param {ReturnType<typeof import('./normalize.js').normalizeScanResults>} result @returns {string} */
function buildPrompt(result) {
  return [
    'You are analyzing static-analysis output for a JavaScript/React codebase.',
    "Below is a JSON digest of one scan: aggregate metrics, the files with the highest complexity/severity, and any tool warnings (tools that were skipped or failed).",
    '',
    JSON.stringify(buildDigest(result), null, 2),
    '',
    'Respond with ONLY a JSON object (no markdown code fences, no other text before or after) of exactly this shape:',
    '{"summary": "2 to 3 paragraphs of plain-English prose describing the codebase\'s overall health", "gapAnalysis": ["3 to 5 strings, each one specific risk or recommendation, naming a file from the digest above where relevant"]}',
  ].join('\n');
}

/**
 * @param {string} text Claude's raw response text.
 * @returns {ScanNarrative|null}
 */
function parseNarrative(text) {
  try {
    const parsed = JSON.parse(extractJsonObject(text));
    if (typeof parsed.summary !== 'string' || !Array.isArray(parsed.gapAnalysis)) return null;

    const summary = parsed.summary.trim();
    const gapAnalysis = parsed.gapAnalysis.filter((item) => typeof item === 'string').slice(0, MAX_GAP_ITEMS);
    if (!summary || gapAnalysis.length === 0) return null;

    return { summary, gapAnalysis };
  } catch {
    return null;
  }
}

/**
 * Extracts the outermost `{...}` span from `text`, tolerating the model
 * wrapping its JSON in markdown fences or a stray sentence despite being
 * asked not to.
 *
 * @param {string} text
 * @returns {string}
 */
function extractJsonObject(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) throw new Error('no JSON object found in response text');
  return text.slice(start, end + 1);
}
