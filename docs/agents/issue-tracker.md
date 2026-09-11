# Issue Tracker

Lexync uses GitHub Issues in `VelHRH/lexync` through the `gh` CLI.

Pull requests are not an issue-triage request surface.

## Read

- Read an issue with `gh issue view <number> --json number,title,body,state,url,labels,comments`.
- List issues with `gh issue list` and the filters required by the task.
- Read pull requests with `gh pr view <number>` when an issue or task references one.

## Write

- Create work with `gh issue create`.
- Update labels or metadata with `gh issue edit`.
- Add progress or handoff context with `gh issue comment`.
- Preserve native issue references and blocking relationships in issue bodies.

Do not close an issue until its completion criteria are met. Owner-review pull requests remain open until the owner merges them.
