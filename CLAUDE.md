See README.md, AGENTS.md, and docs/ for project guidance.

Before committing: run `npm run lint` (Terraform lint, Astro check, API syntax). See AGENTS.md and `.cursor/rules/lint-before-commit.mdc`.

When stores, schemas, relations, or access paths change, update [`docs/architecture/data-persistence.md`](docs/architecture/data-persistence.md) in the same PR (`.cursor/rules/data-persistence.mdc`).
