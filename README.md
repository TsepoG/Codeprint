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
3. Run the backend:
   ```bash
   cd backend && npm run dev
   ```
4. In a separate terminal, run the frontend:
   ```bash
   cd frontend && npm run dev
   ```

## Security: `POST /api/scan` runs tools against untrusted, cloned code

The scan endpoint shallow-clones an arbitrary public GitHub repo and runs
eslint, madge, jscpd, and `npm audit` against it in child processes. Treat
the contents of that clone as **hostile input**, not as trusted code:

- **We never run `npm install` / `npm ci` in the cloned repo.** Doing so
  would execute the target's `preinstall`/`postinstall` scripts (and any
  install-time scripts of its transitive dependencies) with the backend
  process's own privileges - a direct remote-code-execution path from
  "scan this GitHub URL". `npm audit` only runs when a `package-lock.json`
  is already committed to the repo, since npm can evaluate that without
  installing anything.
- **eslint never loads the target repo's own config.** It's always invoked
  with an explicit `--config` pointing at our own flat config
  (`src/services/scan/tools/scan.eslint.config.js`). A repo's own
  `eslint.config.js` can specify arbitrary plugins/parsers to load, which
  ESLint will `require()`/`import()` as part of "linting" - that's also
  code execution over untrusted input if we ever let it run.
- **Clone URLs are restricted to `https://github.com/<owner>/<repo>`.**
  This blocks git's other transports (`file://`, `ext::`, arbitrary
  `ssh://` hosts) which could otherwise be used to read local files or
  reach internal network hosts via the clone step itself.
- Static analysis (parsing source for lint/complexity/duplication/import
  graphs) is inherently safer than executing the target's code or build
  scripts, but parsers themselves have had RCE-class bugs, and dependency
  resolution during analysis can still trigger network requests. None of
  these tools run inside a sandbox today - a malicious or malformed repo
  is running against the same host, filesystem, and network access as the
  backend process.

**Follow-up recommendation:** run the clone + tool execution step inside a
locked-down Docker container (no network egress beyond the initial clone,
read-only mounts where possible, a non-root user, resource/time limits) so
a hostile repo is contained even if one of the above mitigations is
bypassed or a tool has its own vulnerability. This has not been done yet.
