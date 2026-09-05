/**
 * Reconciles the two ways the same Terraform resource is identified.
 *
 * inframap's graph nodes are namespaced by the module directory they came
 * from (`envs/prod/aws_s3_bucket.assets`), because separate root modules
 * routinely reuse resource names. checkov and tfsec don't namespace: they
 * report a bare address (`aws_s3_bucket.assets`) plus the file it's declared
 * in (`envs/prod/main.tf`). Selecting a node and selecting a findings row
 * therefore have to be reduced to the same key before they can be matched.
 */

/** Splits `envs/prod/aws_s3_bucket.assets` into its module path and resource name. */
export function splitNodeId(id) {
  const cut = id.lastIndexOf('/')
  return cut === -1 ? { modulePath: '', resource: id } : { modulePath: id.slice(0, cut), resource: id.slice(cut + 1) }
}

/** The directory part of a repo-relative posix path; `''` for the repo root. */
function dirOf(file) {
  if (typeof file !== 'string') return ''
  const cut = file.lastIndexOf('/')
  return cut === -1 ? '' : file.slice(0, cut)
}

/**
 * @typedef {object} ResourceKey
 * @property {string} modulePath Directory the resource is declared in (`''` = repo root).
 * @property {string} resource The bare Terraform address.
 */

/**
 * @param {string} nodeId A node id from `infrastructure.graph`.
 * @returns {ResourceKey}
 */
export function keyFromNode(nodeId) {
  return splitNodeId(nodeId)
}

/**
 * @param {object} finding A finding from `infrastructure.findings`.
 * @returns {ResourceKey}
 */
export function keyFromFinding(finding) {
  return { modulePath: dirOf(finding.file), resource: finding.resource ?? '' }
}

/** @param {ResourceKey} a @param {ResourceKey} b @returns {boolean} */
export function sameResource(a, b) {
  return a.modulePath === b.modulePath && a.resource === b.resource
}

/**
 * Every finding recorded against one resource.
 *
 * Both tools scan the same Terraform, so a resource routinely comes back
 * flagged by each of them under different rule ids - findings are not
 * deduplicated across sources (see the TODO in the backend's normalize.js).
 * Gathering them per resource turns that into the useful view: both tools'
 * take on the same resource, in one place.
 *
 * @param {object[]} findings
 * @param {ResourceKey|null} key
 * @returns {object[]}
 */
export function findingsForResource(findings, key) {
  if (!key) return []
  return findings.filter((finding) => sameResource(keyFromFinding(finding), key))
}
