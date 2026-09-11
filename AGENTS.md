# Repository Agent Rules

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for `VelHRH/lexync`. See `docs/agents/issue-tracker.md`.

### Domain docs

The repository uses a single shared domain context. See `docs/agents/domain.md`.

## Code Changes

- Preserve existing formatting and make the smallest change that fully satisfies the task.
- Do not add code comments, JSDoc, or documentation comments unless the user requests them.
- Preserve unrelated worktree changes and generated local files.

## UI Skill Routing

- Treat changes to HTML, CSS, JSX, TSX, browser-extension UI, Jetpack Compose, and SwiftUI as UI work even when a ticket is phrased as a product feature.
- Use the repository's `impeccable` skill for every UI task. Follow its setup and select the register and platform reference that match the surface.
- Use Impeccable's product register for authenticated web, forms, onboarding, settings, review flows, extension popup and injected controls, dashboards, and other task-oriented interfaces.
- Use Impeccable's brand register for public marketing, landing, privacy, campaign, and portfolio surfaces.
- Also use `design-taste-frontend` for web marketing, landing-page, portfolio, and redesign work. Do not use it for dense product UI, multi-step forms, extension task UI, or native applications.
- Include the selected UI skills and their relevant constraints in delegated implementation prompts.
- Verify web-rendered UI in a real browser at representative desktop and mobile sizes before delivery.
- Run the relevant Impeccable audit or polish flow before final code review.

## Library Documentation

- Use Context7 MCP for current documentation when a task asks about a library, framework, SDK, API, CLI tool, or cloud service.
