// Preloaded via `node --import ./src/testEnv.js --test` (see package.json's
// `test` script) so it runs before any test file's own imports - a plain
// `process.env.DB_PATH = ...` at the top of a test file would run too late,
// since ES module imports are all evaluated before any of the importing
// file's own top-level statements. Keeps tests off the real
// backend/data/codeprint.db.
process.env.DB_PATH = ':memory:';
