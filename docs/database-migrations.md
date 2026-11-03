# Database migration operations

`supabase/migrations` is the only source of truth for the deployed schema. The deployed project advances through the `Push database migrations` workflow. The one exception is the break-glass below, which exists because Actions can itself be unavailable; it runs the same migrations through the same CLI, and the drift check makes any use of it visible. Applying SQL by hand in the Supabase dashboard is never a supported path: it leaves the recorded history and the repository disagreeing.

## Why this exists

The deployed project silently fell behind the repository once already. The web client shipped Audio Clip controls against a database that had neither the storage bucket nor the write contract, and the only way a Learner learned about it was a recording that refused to save. Two things changed so that cannot recur quietly: the push runs in CI under an approval gate, and ordinary CI fails whenever the deployed project is behind.

## Configuration

Set this repository variable so every workflow names the same deployed project:

- `SUPABASE_PROJECT_REF`: the reference of the deployed Supabase project.

Set these secrets. The push workflow reads them from the protected `supabase-migrations` environment; the ordinary CI drift check reads them as repository secrets, because it must run on every pull request and on `main`:

- `SUPABASE_ACCESS_TOKEN`: a Supabase personal access token authorized for that project.
- `SUPABASE_DB_PASSWORD`: the database password of that project.

Add the authorized reviewer to the `supabase-migrations` environment's required reviewers and enable `prevent self-review`, so the person who dispatches a push cannot approve their own schema change. Pull requests from forks receive no secrets, so the drift check fails closed on them by design; push migrations and run CI from a branch in this repository.

## Pushing migrations

Merge the ordinary ticket pull request first, so the migration is on `main` before it reaches the deployed project.

1. Open Actions → `Push database migrations` → `Run workflow`.
2. Leave `push_confirmation` set to `no` and run it. The workflow links the project and prints the migrations a push would apply, without applying anything.
3. Read that list. If it holds anything you did not expect, stop and reconcile the history before going further.
4. Run the workflow again with `push_confirmation` set to `yes`. It applies the pending migrations and then confirms the deployed project matches `supabase/migrations`.

The workflow is serialized, so two pushes cannot overlap.

## The drift check

Every CI run checks the deployed project against `supabase/migrations`:

```sh
pnpm db:verify
```

It fails when the deployed project is missing a migration the repository carries, when the deployed project holds a migration the repository does not, when the linked project is not configured, and when the Supabase CLI cannot report the history at all. It never changes anything. A red `Migration drift` job means the deployed database and the shipped client disagree: push the pending migrations before releasing anything that depends on them.

## Local break-glass

```sh
pnpm db:push
```

This pushes to the linked project from a local shell. It exists for the case where Actions itself is unavailable. It bypasses the approval gate, so prefer the workflow, and run `pnpm db:verify` afterwards either way. Local development never needs it: `pnpm backend:reset` applies every migration to the local stack.

## Reconciling a divergent history

When the deployed project holds a migration this repository does not carry, the two histories have diverged and no push will fix it. Identify the entry with `pnpm dlx supabase@2.115.0 migration list --linked`, decide whether the deployed entry should be adopted into the repository or marked reverted, and apply that decision with `supabase migration repair`. Do not delete or renumber a migration that has already been applied to the deployed project.
