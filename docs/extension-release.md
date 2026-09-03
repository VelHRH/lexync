# Extension release operations

## Release configuration

The `chrome-web-store` GitHub environment is the protected environment for all release and publication workflows. Add the authorized release reviewer to the environment's required reviewers, and enable the `prevent self-review` choice so the person who triggered the workflow cannot approve their own deployment.

Configure these repository variables so ordinary CI can include the listing identity in release provenance metadata:

- `CHROME_EXTENSION_ID`: the existing Chrome Web Store listing ID.
- `CHROME_PUBLISHER_ID`: the Chrome Web Store publisher ID.

On the protected `chrome-web-store` environment, configure these secrets so credential access remains approval-gated:

- `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL`: the service account email authorized for the publisher account.
- `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY`: the service account PEM private key. A repository secret may contain escaped `\n` sequences; the publication helper normalizes them before signing.

Keep the environment protected and keep the service account limited to the Chrome Web Store operations needed by these workflows.

## CI artifact and staged submission

The CI workflow builds the extension, runs the application checks, packages the extension once, and produces the exact ZIP artifact and release metadata. The staged-release workflow is manually dispatched with an exact version tag and successful CI run ID. It verifies the tag, commit, artifact checksum, release metadata, listing identity, and version history before submitting that exact ZIP to the existing listing for staged review. It records the ZIP checksum and commit provenance in the GitHub release.

The staged-release workflow does not publish a staged revision publicly. Review the submitted revision in the Chrome Web Store dashboard. The separate `Publish approved staged extension` workflow is the explicit operator path for status and publication:

1. Dispatch it with the approved extension version and leave publish confirmation set to `no` to inspect status only.
2. Dispatch it again with the same version and set publish confirmation to `yes` only after the staged revision is approved and ready.
3. The workflow checks status, validates that the submitted revision is `STAGED` and has the expected version, publishes the existing staged revision without uploading bytes, and checks status again.

The helper obtains a short-lived service-account token, never rebuilds or uploads an artifact, and fails closed on authentication, HTTP, or response-schema errors.

## Production smoke checklist

After public publication, verify the following with a production account and a representative page:

- Install or update the extension from the Chrome Web Store.
- Sign in and confirm the authenticated state is retained after reopening the browser.
- Capture a word and a selected phrase, including the expected learning language and answer language.
- Confirm captured vocabulary synchronizes to the web client and another signed-in client.
- Open Learning Mode and verify saved expressions, unsaved capture actions, and the expected active learning language.
- Complete a scheduled review and a free-practice session, checking that each flow shows the correct material and records its result.

## Rollback and recovery

Rollback depends on the publication state:

- For a submission still in pending review, cancel the pending review in the Chrome Web Store dashboard. Do not publish it.
- For an approved staged release that should not go public yet, withhold the staged release and leave it unpublished. The separate publication workflow should not be dispatched.
- For a public defect, rebuild the last known-good code, assign a higher extension version, run CI and the staged submission checks again, and submit and publish that higher version after review. Chrome Web Store versions cannot be downgraded or reused.

Initial Chrome Web Store listing creation and account setup are outside the scope of these release workflows.
