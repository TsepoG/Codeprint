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
   This bundles the whole scan toolchain, so the first build takes a few
   minutes and pulls roughly 700MB. Rebuild it whenever anything under
   `backend/src/services/scan/` changes: the container runs a copy of that
   code, so a scan will silently keep using the old version until you do.

   | Tool | Installed as | Used for |
   | --- | --- | --- |
   | eslint, madge, jscpd | npm packages | JS/React quality, dependency graph, duplication |
   | `npm audit` | bundled with node | dependency vulnerabilities |
   | checkov `3.3.16` | pip (Python CLI) | Terraform misconfigurations |
   | tfsec `1.28.14` | pinned release tarball, sha256-verified | Terraform misconfigurations |
   | inframap `0.8.0` | pinned release tarball, sha256-verified | Terraform resource graph |

   The three Terraform tools are **only invoked when the cloned repo
   actually contains `.tf` files** (see [Terraform scanning](#terraform-scanning)),
   so a JS-only repo never pays for them. All of these live in the image
   and are never installed on the host - nothing here needs to be on your
   own `PATH`.
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

Alongside the summary `metrics` (bug/vulnerability/code-smell counts, duplication percentage), a completed scan's result carries `findings` - the individual problems those counts are counting, as one flat array covering every tool: eslint (`bug`/`codeSmell`), `npm audit` (`vulnerability`), jscpd (`duplication`), and checkov/tfsec (`infra`, also still available nested under `infrastructure.findings`). Each finding has a stable `id`, its `category`/`source`, `file`/`line`/`endLine` where applicable, a `severity` on the same high/medium/low scale used everywhere else, a `ruleId`, a `description`, and - captured from the clone while it still existed, before the scan container was torn down - a `snippet` (`{startLine, text}`) of the flagged code plus a few lines of context. A duplication finding also carries `duplicateOf`, the matched pair's own location and snippet. Findings with no meaningful file location (an npm advisory naming a dependency, not a place in the repo) simply have `file`/`line`/`snippet` all `null`.

A completed scan's normalized output is also sent to the Claude API to generate a short narrative - a plain-English health summary plus a bulleted gap analysis - attached as `result.narrative`. This step requires an `ANTHROPIC_API_KEY` (see `backend/.env.example`); without one (or if the API call fails/times out), the scan still completes normally, it just has no `narrative`.

### Terraform scanning

The clone phase records where the repo's Terraform lives - every directory that *directly* contains `.tf` files, plus any committed `.tfstate` - ignoring `.git`/`node_modules`/`.terraform`. If there is none, no infrastructure tooling runs at all and the response's `infrastructure` section is just `{ detected: false, findings: [], graph: { nodes: [], edges: [] } }`. If there is, the analyze phase additionally runs **checkov** (`-d <repo> -o json --framework terraform`), **tfsec** (`<repo> --format json`), and **inframap**, and the result gains:

```jsonc
"infrastructure": {
  "detected": true,
  "findings": [
    {
      "resource": "aws_s3_bucket.data",   // as named by the tool
      "file": "infra/s3.tf",              // repo-relative
      "line": 12,
      "ruleId": "CKV_AWS_18",
      "severity": "high",                 // high | medium | low
      "description": "Ensure the S3 bucket has access logging enabled",
      "source": "checkov"                 // checkov | tfsec
    }
  ],
  "graph": {                              // from inframap
    "nodes": [{ "id": "aws_s3_bucket.assets" }],
    "edges": [{ "from": "aws_instance.app", "to": "aws_security_group.web" }]
  }
}
```

`infrastructure.graph` uses the same `{ nodes, edges }` shape as `dependencyGraph`, so the same rendering can draw either. A few things worth knowing about how it's built:

- **inframap only emits Graphviz DOT** - it has no JSON printer - so its output is parsed into nodes and edges. Node names can themselves contain `->` (inframap represents public ingress as pseudo-nodes like `im_out.tcp/443->443`), which is why the parser tokenizes quoted names rather than splitting on the arrow.
- **It reads one root module at a time and does not recurse**, so it's run once per Terraform directory and the results are merged. A directory it can't parse (a module that isn't a standalone root module, or Terraform 0.11-era syntax) is skipped, and the rest still graph - that becomes one aggregated warning rather than one per directory.
- **Node ids are namespaced by module directory** (`envs/prod/aws_s3_bucket.assets`) for Terraform outside the repo root, because separate root modules routinely reuse resource names and merging an `envs/prod` bucket with an `envs/dev` one would draw edges between unrelated infrastructure. Terraform at the repo root keeps its bare name, so a single-module repo reads exactly as inframap named it.
- **State beats source.** If the repo committed any `.tfstate`, the graph is built from that (it describes infrastructure that actually exists); otherwise it's built from HCL with `--hcl`.
- Icons are disabled (`--show-icons=false`): icon mode writes PNG assets into a cache under `$HOME`, and the scan container's filesystem is read-only. Unconnected resources are kept (`--clean=false`) so a repo of standalone resources doesn't graph as nothing.

Both scanners rate findings CRITICAL/HIGH/MEDIUM/LOW; those fold onto the same high/medium/low scale the rest of the app uses (CRITICAL and HIGH both become `high`; anything unrecognized, including checkov's `null` severity, becomes `low`). Each tool degrades the same way the JS tools do - if any of the three is missing, times out, or chokes on malformed HCL, it contributes a string to `warnings` and the rest of the scan (including the other infra tools) still completes.

Terraform and JS scanning are fully independent: a repo can have both, either, or neither.

**Known gap:** findings are *not* deduplicated across the two tools. checkov and tfsec frequently flag the same underlying issue under different rule ids, so a repo scanned by both will show it twice - once per `source`. Merging them needs a mapping between the two rule sets, which isn't built yet (there's a matching `TODO` in `normalize.js`).

## Testing

```bash
cd backend && npm test     # node:test + c8
cd frontend && npm test    # vitest + testing-library
```

Both packages keep their tests in a `tests/` directory mirroring `src/`,
and both write lcov into `coverage/`, which
`.github/workflows/ci.yml` uploads as a build artifact.

**Nothing in either suite touches the network, Docker, or a real tool
binary.** Every child process the backend spawns goes through one seam -
the mutable `childProcess` object in `src/services/scan/runTool.js` - which
tests substitute, so `git clone`, eslint, checkov, tfsec and inframap are
all answered with canned output. (The seam exists because ES module
bindings are non-configurable and can't be patched with `node:test`'s
`mock.method`.) The Terraform tools' raw output lives in
`tests/services/scan/__fixtures__/` and is normalized in
`normalize.test.js`; `tests/services/scan/index.test.js` covers the
orchestration on top - notably that a repo with no `.tf` files never
spawns checkov/tfsec/inframap at all and reports
`infrastructure.detected: false`.

## Security: `POST /api/scan` runs tools against untrusted, cloned code

The scan endpoint shallow-clones an arbitrary repo and runs eslint,
madge, jscpd, and `npm audit` against it - plus checkov, tfsec, and
inframap when the repo contains Terraform. Treat the contents of that clone as
**hostile input**, not as trusted code. This section covers
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
  `container/analyzePhase.js`. eslint/madge/jscpd - and
  checkov/tfsec/inframap, when the repo has Terraform - are pure static analysis over files
  already on disk and never need network, so denying it entirely means a
  malicious repo can't exfiltrate anything or reach other hosts during
  this phase even if one of these tools has an RCE-class bug. Both phases
  run in the same container and so share its filesystem directly
  (`container/workspace.js`) - no volume or bind mount needed between
  them.
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
- **The Terraform scanners are never given the chance to fetch anything.**
  Neither `terraform init` nor any module/provider download ever runs, so
  a repo's `source = "..."` module references are only ever read as text.
  checkov and tfsec both run in the network-severed analyze phase, so even
  if one of them tried to resolve a remote module, it couldn't reach it.
- **The infra binaries are pinned and verified at image-build time.**
  checkov is installed at an exact version, and the tfsec and inframap
  release tarballs are each checked against a hardcoded sha256 before being
  unpacked or made executable (see `Dockerfile.scan-runner`) - these are
  binaries we hand untrusted input to, so a silently-swapped download
  shouldn't be able to become code execution. (inframap is pinned to 0.8.0
  rather than the newer 0.8.1 tag for a mundane reason: 0.8.1 publishes no
  release binaries.)

### 4. Tests

`backend/tests/services/scan/clone.test.js` unit-tests `isValidRepoUrl`
directly against the SSRF/confusion cases above (fast, and doesn't risk
tripping the rate limiter the way dozens of HTTP round-trips would);
`backend/tests/app.test.js` has a couple of thin end-to-end checks
confirming the route actually wires validation failures to a `400`. None
of this needs Docker - it all short-circuits before a container would
ever be started. See [Testing](#testing) for the suite as a whole.

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
