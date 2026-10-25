# Release Guide

A RecordTree release publishes the production Docker image and a GitHub Release from a version tag. The version, branch, validation, signing, and approval rules follow [Commits and handoff](../../AGENTS.md#commits-and-handoff).

## Prepare

1. Keep the version in `pyproject.toml`, `recordtree/__init__.py`, `web/package.json`, and both root version fields in `web/package-lock.json` consistent. Refresh the lockfiles after changing package metadata or dependencies.
2. Write `docs/releases/vX.Y.Z.md` for the exact tag, following [Release notes](#release-notes). Describe the release's features, installation, and material limitations in present tense. The Release workflow requires this file to be non-empty and uses it as the GitHub Release body.
3. Review changed files and public endpoint allowlist entries. Run the [validation targets and sensitive data check](../../AGENTS.md#validation-commands).
4. Test a fresh production container with synthetic import data, search, and a download plan. For manual MEGAcmd acceptance, check login, a download to a temporary directory, interruption, and resume with content you are authorized to download. Keep private test material outside tracked files as described in the [testing guide](testing.md#fixture-principles).
5. Commit the release preparation, push it to `main`, and wait for Full to pass on that exact commit. Confirm the tag is unused and `DOCKERHUB_TOKEN` is configured in repository secrets.

## Release Notes

Write release notes in English. Start directly with the release body; the
filename and GitHub Release title identify the version, so the file does not
repeat the title as a level-one heading.

Keep upgrade alerts, the short summary, and any `## Known Issue` section
expanded. Put alerts before the summary and known issues after the area
blocks. Fold only the detailed changes, with one block per user-facing area:

```markdown
<details>
<summary><strong>Import and library synchronization</strong></summary>

- Keep each user-visible change in its own bullet.

</details>
```

The area title replaces a Markdown heading. Keep a blank line after
`<summary>` and before `</details>` so GitHub renders the contents as Markdown.

## Publish

Tagging and pushing the approved commit starts publication. For version `0.1.0`, on a clean, synchronized `main` with a passing Full run:

```bash
git tag -s v0.1.0 -m "RecordTree v0.1.0"
git push origin refs/tags/v0.1.0
```

The Release workflow checks the package version, release notes, membership in `main`, and the Full result before publishing images. Image names, version tags, platform support, and deployment steps are defined in the [Docker guide](../user-guide/docker.md#images).

After the image push succeeds, the workflow creates the GitHub Release with the checked-in notes. A rerun preserves an existing GitHub Release. Inspect a failed run before retrying; keep a published tag fixed, and use a new version for source changes.

## Verify Publication

- Confirm the Release workflow succeeds and its GitHub Release body matches the notes file.
- Pull the exact release image from Docker Hub and GHCR and check its version and license metadata.
- Start the documented Compose service in an empty directory, check the WebUI, initialize it, and follow the manual MEGAcmd acceptance steps above.
- Confirm mounted data survives container recreation. Check the runtime paths in the [Docker guide](../user-guide/docker.md#persistent-data).
