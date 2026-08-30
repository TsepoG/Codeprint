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

## Security: `POST /api/scan` runs tools against untrusted, cloned code

The scan endpoint shallow-clones an arbitrary public GitHub repo and runs
eslint, madge, jscpd, and `npm audit` against it. Treat the contents of
that clone as **hostile input**, not as trusted code.

**The clone and all four tools run inside a short-lived, locked-down
Docker container - never in the backend's own process.** See
`Dockerfile.scan-runner` and `src/services/scan/dockerRunner.js`. Per
scan request, the backend runs one container from a pre-built image and
waits for a single JSON line on stdout:

- `--rm` plus a unique `--name`: the container (and everything it wrote,
  entirely to its own tmpfs) is destroyed as soon as it exits, whether
  normally, on internal timeout, or force-killed by the host.
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
- The host still enforces its own timeout (`SCAN_CONTAINER_TIMEOUT_MS`)
  around the whole `docker run`, and `docker kill`s the named container
  if that fires - a backstop in case the container's own internal
  timeout doesn't (see `SCAN_CLONE_TIMEOUT_MS`/`SCAN_TOOL_TIMEOUT_MS`/
  `SCAN_TOTAL_TIMEOUT_MS`, forwarded into the container by
  `dockerRunner.js`).

This is defense in depth, not a replacement for the mitigations below -
the container just ensures a bypass of any one of them is contained
rather than landing directly on the host:

- **We never run `npm install` / `npm ci` in the cloned repo.** Doing so
  would execute the target's `preinstall`/`postinstall` scripts (and any
  install-time scripts of its transitive dependencies) - a direct
  remote-code-execution path from "scan this GitHub URL", container or
  not. `npm audit` only runs when a `package-lock.json` is already
  committed to the repo, since npm can evaluate that without installing
  anything.
- **eslint never loads the target repo's own config.** It's always invoked
  with an explicit `--config` pointing at our own flat config
  (`src/services/scan/tools/scan.eslint.config.js`). A repo's own
  `eslint.config.js` can specify arbitrary plugins/parsers to load, which
  ESLint will `require()`/`import()` as part of "linting" - that's also
  code execution over untrusted input if we ever let it run.
- **Clone URLs are restricted to `https://github.com/<owner>/<repo>`.**
  This blocks git's other transports (`file://`, `ext::`, arbitrary
  `ssh://` hosts) which could otherwise be used to read local files or
  reach internal network hosts via the clone step itself. Validated both
  before the container is ever launched (`routes/scan.js`) and again
  inside it (`container/entrypoint.js`) as defense in depth.

**Known residual gap:** the container keeps network access for its whole
lifetime (git clone needs it, and so does `npm audit`, which contacts the
registry's advisory endpoint), so it isn't network-isolated the way a
pure static-analysis step ideally would be. A tighter follow-up would
split clone (network on) from analysis (network off, `--network none`)
across two containers sharing a Docker volume - not done here because
`npm audit` needs network regardless, which undercuts most of the benefit
for the added complexity of a two-container pipeline per request.
