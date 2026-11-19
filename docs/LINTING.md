# Linting

`npm run lint` checks the product source directories, including `src/`, `scripts/`, and `mcp/`.

The ESLint configuration excludes only generated or repository-local tooling artifacts: `.claude/`, `.claude-flow/`, `.swarm/`, `.remote-desktop/`, and `.plugin-build/`. These directories contain hooks, logs, state, or packaged plugin output rather than application code.
