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
