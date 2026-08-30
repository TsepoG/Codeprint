# Codeprint

Codeprint is a tool that plugs into a GitHub repository and runs code quality, dependency, and security analysis, presenting the results through a dashboard UI — starting with support for JS/React codebases.

## Project structure

This is a monorepo with two packages:

- `frontend/` — Vite + React dashboard UI
- `backend/` — Node + Express API

## Setup

1. Install dependencies for each package:
   ```bash
   cd frontend && npm install
   cd ../backend && npm install
   ```
2. Copy `backend/.env.example` to `backend/.env` and adjust values as needed.
3. Build the scan-runner image (`POST /api/scan` shells out to it - see
   the security notes below - so Docker must be installed and running):
   ```bash
   cd backend && docker build -f Dockerfile.scan-runner -t codeprint-scan-runner:latest .
   ```
4. Run the backend:
   ```bash
   cd backend && npm run dev
   ```
5. In a separate terminal, run the frontend:
   ```bash
   cd frontend && npm run dev
   ```

## API

- `POST /api/scan` - body `{ repoUrl }`, returns `202 { jobId, status: 'queued' }` immediately; the scan runs in the background (see the security section below).
- `GET /api/scan/:jobId` - poll for the job's status: `{ status: 'queued'|'running' }` while in progress, `{ status: 'complete', result }` or `{ status: 'failed', error }` once done. 404 once the in-memory job entry expires (`SCAN_JOB_TTL_MS`, default 30 minutes).
- `GET /api/scans?repoUrl=&page=&pageSize=` - lists **persisted** scan history, most recent first, paginated (`{ scans, total, page, pageSize }`). Each entry is a summary (`metrics`, `avgComplexity`) rather than the full result.
- `GET /api/scans/:id` - one persisted scan's full record, including its complete result.

Every scan that reaches a terminal state (complete or failed) is written to a SQLite database (`better-sqlite3`, no separate DB server) at `DB_PATH` (default `backend/data/codeprint.db`, created automatically) - this is what survives a backend restart and what the frontend's History tab reads from. The live job store (`GET /api/scan/:jobId`) is separate and still in-memory/ephemeral, since it only needs to answer "is this specific run done yet" for as long as a client might be polling it.

A completed scan's normalized output is also sent to the Claude API to generate a short narrative - a plain-English health summary plus a bulleted gap analysis - attached as `result.narrative`. This step requires an `ANTHROPIC_API_KEY` (see `backend/.env.example`); without one (or if the API call fails/times out), the scan still completes normally, it just has no `narrative`.

## Security: `POST /api/scan` runs tools against untrusted, cloned code

The scan endpoint shallow-clones an arbitrary repo and runs eslint,
madge, jscpd, and `npm audit` against it. Treat the contents of that
clone as **hostile input**, not as trusted code. This section covers
each layer of protection, roughly in the order a request passes through
them.

### 1. URL validation (SSRF)

`isValidRepoUrl` (`src/services/scan/clone.js`) only accepts
`https://github.com/<owner>/<repo>` or `https://gitlab.com/<owner>/<repo>`
(`.git` suffix and trailing slash optional). It's implemented with the
WHATWG `URL` parser against an exact-hostname allowlist, not a
hand-rolled regex over the raw string, which matters:

- A raw IP, `localhost`, a cloud metadata address (`169.254.169.254`), or
  any other internal/arbitrary hostname can never match, because we
  compare the parsed, canonical `hostname` against exactly two literal
  strings - not a substring/prefix check.
- IP-obfuscation tricks don't help an attacker: a decimal/octal/hex form
  like `2130706433` for `127.0.0.1` gets canonicalized into dotted-decimal
  form by the URL parser itself, *before* the allowlist check ever runs.
- Userinfo (`user@host`), a non-default port, and a query/fragment are
  all rejected outright - a legitimate clone URL never needs them, and
  they're common tricks for confusing simpler validators.
- Requiring `protocol === 'https:'` blocks git's other transports
  (`file://`, `ext::`, arbitrary `ssh://` hosts) outright.

Validated both before any container is ever started (`routes/scan.js`,
so a rejected URL costs nothing) and again inside the container
(`container/clonePhase.js`) as defense in depth. See
`src/services/scan/clone.test.js` for the full set of cases this closes
off (decimal-IP encoding, `github.com.evil.example`, userinfo tricks,
etc.) - malformed or disallowed URLs get a `400` with a clear message.

### 2. Time and size budgets

- **Rate limiting** (`routes/scan.js`, via `express-rate-limit`):
  `SCAN_RATE_LIMIT_MAX` requests (default 10) per IP per
  `SCAN_RATE_LIMIT_WINDOW_MS` (default 15 minutes) - a `429` past that.
  In-memory, which is fine for a single backend instance; swap for a
  shared store (e.g. Redis) before running more than one.
- **Repo size cap** (default 500MB, `SCAN_MAX_REPO_SIZE_MB`), checked
  twice: a best-effort **pre-flight** check against the GitHub/GitLab
  API (`repoSizeCheck.js`) before any container is even started - so an
  obviously oversized repo costs a sub-second API call, not a clone -
  and an authoritative **post-clone** check inside the container
  (`clonePhase` in `index.js`, via `diskUsage.js`'s symlink-safe
  recursive size walk) that always runs, since the pre-flight one can't
  see everything (the provider API can be unreachable, rate-limited, or
  not exposed for a given repo). Either check failing returns `413`.
- **Hard scan timeout** (`SCAN_CONTAINER_TIMEOUT_MS`, default 5 minutes):
  a host-side wall-clock ceiling across the *entire* scan. If it fires,
  the host force-stops the container (`docker stop -t 0`, immediate
  SIGKILL) regardless of what the container's own internal per-tool
  timeouts (`SCAN_CLONE_TIMEOUT_MS`/`SCAN_TOOL_TIMEOUT_MS`) are doing -
  `504` either way.

### 3. Container isolation and network segmentation

**The clone and all four tools run inside a short-lived, locked-down
Docker container - never in the backend's own process.** See
`Dockerfile.scan-runner` and `src/services/scan/dockerRunner.js`. Per
scan request, the backend starts one idling container and `docker exec`s
into it twice, reading one JSON line back from each `exec`'s stdout:

- **Network is split across the two phases, not left on for the whole
  scan.** The container starts attached to the network so
  `container/clonePhase.js` can clone the repo and run `npm audit` (the
  only tool that needs network access, to query the advisory database).
  Once that's done, the host runs `docker network disconnect` on the
  *running* container - fully severing its network interfaces, verified
  (not just configured) to actually cut off connectivity, not merely
  block new connections - before `docker exec`ing
  `container/analyzePhase.js`. eslint/madge/jscpd are pure static
  analysis over files already on disk and never need network, so denying
  it entirely means a malicious repo can't exfiltrate anything or reach
  other hosts during this phase even if one of these tools has an
  RCE-class bug. Both phases run in the same container and so share its
  filesystem directly (`container/workspace.js`) - no volume or bind
  mount needed between them.
- `--rm` plus a unique `--name`: the container (and everything it wrote,
  entirely to its own tmpfs) is destroyed as soon as it's stopped,
  whether normally or via the timeout backstop above.
- `--cap-drop ALL --security-opt no-new-privileges`, a non-root `USER`
  baked into the image, and `--read-only` with only a size-capped
  `--tmpfs /tmp` writable: a compromised tool has no capabilities, can't
  gain more, can't write to the image/root filesystem, and can't fill the
  host's disk.
- `--memory` / `--memory-swap` (equal, to disable swap) / `--cpus` /
  `--pids-limit`: hard ceilings so one hostile repo (a zip-bomb-style
  `package.json`, a fork-bomb in a `postinstall` we'd never run anyway, an
  infinite-loop parser input) can't exhaust the host.
- **No bind mounts.** Nothing from the host filesystem is exposed to the
  container, and nothing the container writes reaches host disk - the
  only data crossing the boundary is the `repoUrl` argument in and the
  normalized JSON result out.

This is defense in depth, not a replacement for the mitigations below -
the container just ensures a bypass of any one of them is contained
rather than landing directly on the host:

- **We never run `npm install` / `npm ci` in the cloned repo.** Doing so
  would execute the target's `preinstall`/`postinstall` scripts (and any
  install-time scripts of its transitive dependencies) - a direct
  remote-code-execution path from "scan this repo URL", container or
  not. `npm audit` only runs when a `package-lock.json` is already
  committed to the repo, since npm can evaluate that without installing
  anything.
- **eslint never loads the target repo's own config.** It's always invoked
  with an explicit `--config` pointing at our own flat config
  (`src/services/scan/tools/scan.eslint.config.js`). A repo's own
  `eslint.config.js` can specify arbitrary plugins/parsers to load, which
  ESLint will `require()`/`import()` as part of "linting" - that's also
  code execution over untrusted input if we ever let it run.

### 4. Tests

`src/services/scan/clone.test.js` unit-tests `isValidRepoUrl` directly
against the SSRF/confusion cases above (fast, and doesn't risk tripping
the rate limiter the way dozens of HTTP round-trips would); `app.test.js`
has a couple of thin end-to-end checks confirming the route actually
wires validation failures to a `400`. None of this needs Docker - it all
short-circuits before a container would ever be started.

### Known residual gaps

- **Rate limiting is per-process, in-memory.** Fine for one backend
  instance; running more than one behind a load balancer needs a shared
  store.
- **The pre-flight size check is best-effort, not authoritative** - it's
  a convenience that saves the common case a wasted clone, not a security
  boundary. The post-clone check inside the container is what's actually
  relied on.
- **`npm audit` still needs network**, so the clone phase can't be fully
  network-isolated the way the analyze phase is - it's scoped as tightly
  as the tools' own requirements allow, not eliminated.
