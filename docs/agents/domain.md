# Domain Documentation

Lexync uses a single shared domain context across its web, extension, mobile, and package workspaces.

## Sources

- Read `CONTEXT.md` before changing domain concepts, vocabulary, ownership, or cross-surface behavior.
- Read relevant records in `docs/adr/` before changing an established architectural decision.
- Add a new ADR when a durable architectural decision cannot be represented as a small update to an existing record.

## Consumer rules

- Use the exact domain terms and boundaries defined in `CONTEXT.md`.
- Keep platform-specific implementation details out of the shared glossary.
- When implementation and documentation disagree, resolve the discrepancy explicitly instead of silently introducing a second meaning.
