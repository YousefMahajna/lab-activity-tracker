# Process Lab Activities

The regular [Activities link](https://yousefmahajna.github.io/lab-activity-tracker/) keeps its name and Guest / Lab Practical Engineer / Process Lab Manager entry screen, including the existing password checks. Existing regular-link sessions still work.

Opening Activities from [Process Lab](https://yousefmahajna.github.io/interconnect-process-lab/) passes only the selected email in the URL fragment. Activities reads the current shared `platforms.json` and `access-policy.js` from the hub. It ignores names and roles supplied in the URL and does not reuse a legacy session or offline role if permissions cannot be read.

| Process Lab access | Activities behavior |
| --- | --- |
| Viewer | Existing Guest role: view and add unassigned activities; no owner, scheduling, existing-activity editing or settings access |
| Editor | Existing Lab Practical Engineer editing permissions |
| Manager / Administrator | Existing manager permissions |
| No access / failed permission lookup | Blocked entry with Retry and a link back to Process Lab |

General NVIDIA access uses the shared policy, currently Viewer for Activities. Permission changes apply when the application reloads. Hub entry adds the person's name, permission level and a back link. Drafts and pending changes keep their original name/email and role, so an Editor draft is not projected into a later Viewer session.

The hub currently selects an email without verifying ownership. These are client-side presentation rules, not NVIDIA SSO or server-side authorization. The old direct-link password flow is retained as requested.

## Shared saving

The live journal and existing data are preserved. Reads use the public GitHub Gist anonymously until an explicit saving connection is established. Anonymous background reads run at most once every five minutes; connected polling retains the existing 30-second interval.

The page contains no GitHub credential. **Connect saving** accepts a GitHub token belonging to the shared Gist owner with Gists: Read and write permission. The credential is held only in this tab's memory and is never put in browser storage, URLs or source. The input clears after connection attempts and cancellation. Other users' personal GitHub accounts cannot publish to an owner-owned Gist.

Disconnected edits remain in the existing durable operation queue and draft storage. Connecting saving sends those operations using the existing append-only journal and conflict checks. Failed saves keep pending work and do not claim confirmation. Viewer sessions cannot send changes even if older editor work exists in the browser. Regular Guest users retain their existing ability to add tasks; publishing those additions requires a saving connection.

The previously embedded credential must be revoked by the repository owner in [GitHub token settings](https://github.com/settings/tokens). Removing it from current source does not invalidate copies in repository history or old HTML backups.

## Checks

Run `node --test tests/*.test.cjs`. Tests use synthetic data and mock all writes. A separate Playwright integration check validates regular entry, the actual hub link, all role mappings, failed lookups, Viewer edit guards, role-separated pending work and connected saving without writing to the live Gist.

## Viewer permissions and quota recovery

A Process Lab Viewer maps to the existing Guest role. New activities must be unassigned and unscheduled, with no completion date or status notes. Existing activities cannot be edited or deleted. Editor and Manager roles keep their existing permissions. The role badge still says Viewer for hub entry.

Permission lookups can read the same public main-branch policy file when the GitHub API quota is exhausted. If live journal reads are also rate-limited, the Gist owner can use Connect saving (owner) on the entry screen. A successful connection retries hub entry without reloading or changing the selected user’s role. No new public Activities copy, snapshot job or embedded credential is included in this change.
