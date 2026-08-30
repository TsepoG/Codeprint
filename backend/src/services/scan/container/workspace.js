import path from 'node:path';
import { tmpdir } from 'node:os';

// clonePhase.js and analyzePhase.js are `docker exec`'d into the *same*
// container (see dockerRunner.js) so they share this filesystem path
// directly - no volume or bind mount needed between them. Lives under
// the container's own tmpfs /tmp (see Dockerfile.scan-runner's
// `--read-only` + `--tmpfs /tmp`).
export const WORKSPACE = path.join(tmpdir(), 'repo');
