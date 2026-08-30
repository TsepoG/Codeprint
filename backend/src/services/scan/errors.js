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
