/** Thrown when a request's `repoUrl` fails validation. */
export class InvalidRepoUrlError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'InvalidRepoUrlError';
  }
}

/** Thrown when a scan is aborted for exceeding the overall scan timeout. */
export class ScanTimeoutError extends Error {
  /** @param {string} [message] */
  constructor(message = 'Scan timed out') {
    super(message);
    this.name = 'ScanTimeoutError';
  }
}

/** Thrown when `git clone` fails, times out, or is aborted. */
export class CloneError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'CloneError';
  }
}

/** Thrown when a repo exceeds the configured scan size cap (`SCAN_MAX_REPO_SIZE_MB`). */
export class RepoTooLargeError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'RepoTooLargeError';
  }
}

/**
 * Thrown when the scan-runner image's baked-in copy of `src/services/scan`
 * (see `Dockerfile.scan-runner`) no longer matches the code on disk - i.e.
 * the image is stale and hasn't been rebuilt since a scan-pipeline change.
 * Without this check a stale image runs silently, producing results (or
 * missing findings) from whatever old code it happened to bundle - see
 * `dockerRunner.js`'s pre-flight freshness check.
 */
export class StaleScanImageError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'StaleScanImageError';
  }
}
