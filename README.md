# Process Lab Activities — Firebase shared journal

Normal sign-in and synchronization use Firebase. Standalone Viewer and Lab Practical Engineer use a self-entered name with no email or password. A separate anonymous Firebase app preserves any existing owner/Adhesives session. Anyone with the link can choose these two roles; names are not verified identities. Only verified ymahajna@nvidia.com may use Manager / Owner. Process Lab entry uses its selected email to choose the displayed name and lower role from the permission mirror; this handoff cannot grant Owner access.

## Owner activation

For name-only entry, enable Anonymous in Firebase Authentication → Sign-in method and publish the updated rules from `shared-setup.html`. If Activities is already initialized, do not initialize or migrate again.

For the first migration only: open `shared-setup.html`. Publish its updated `firebase-database-rules.json` in the existing lab-tracker-nvidia Realtime Database, sign in as verified ymahajna@nvidia.com, preview the latest GitHub journal, close old Activities tabs, and initialize. Source reads are complete and hash-verified. If that one-time read is rate-limited, wait for the reset or enter an owner GitHub token on this setup page. It remains only in page memory and is cleared after successful initialization or leaving the page. No source writes are made.

Initialization is a conditional null-only write to `activitiesJournalV1`. It preserves the tracker instance, activity/note IDs, current data, recipients, revision, history, operation hashes and retained conflicts. No replacement of existing Firebase inventory or GitHub journal occurs. The latest confirmed source was read during implementation: 96 activities, 97 notes, revision 3, no conflicts; always inspect the current preview before activating. Once initialized, reload every old Activities tab so it stops using GitHub. Close old tabs before initialization to avoid later Gist-only changes.

The updated rules remove the public read grant at the database root and keep explicit existing read access at appState, processRecipeLibrary, adhesiveAccessV1 and adhesivesSharedV1. The Activities journal permits anonymous Firebase sessions to read and submit permitted Viewer/Lab operations, while Owner operations require Yousef’s verified account. Unauthenticated REST requests remain denied. Do not restore a global `.read:true` or `.write:true`, because parent grants bypass child restrictions. Existing Activities appState and Recipe Library writes are otherwise unchanged.

## Authorization and storage

`activitiesAccessV1` is an owner-written mirror of the saved Process Lab Users list. The hub synchronizes it after Users saves; failed mirror updates are reported. Shared setup has a Sync Activities permissions retry. Hub-selected users use their saved/general lower role; only the owner email can trigger the Owner sign-in flow. Standalone name-only Lab access is open regardless of this mirror by explicit owner request.

Operations are append-only, bound to a Firebase UID and an allowed role; anonymous records have an empty email. Native operation types and field names are visible to server rules. Viewers (Guest role) may add only unassigned, unscheduled activities without status notes. Editors keep existing permitted activity/note edits, but assignment, scheduling, deletion and settings require Manager/Owner. Managers can resolve retained conflicts; an author can resolve their own new Firebase operations. Imported historical conflicts require manager recovery. Entries cannot be overwritten or deleted by normal clients.

JSON strings preserve nulls and empty arrays in before/after values. Protected new-task fields are stored separately and overwrite opaque values during decoding. Every reader validates decoded requests before applying them. Malformed records remain retained for owner review and are excluded from the state; a write is acknowledged only after its operation was actually processed. Concurrent stale edits retain a conflict rather than silently overwrite a field.

The migration creates an initial checkpoint and keeps prior operation hashes for safe retries of already confirmed work. Old role passwords are not copied; password-only history is redacted, while original records stay in the unchanged Gist. Old unconfirmed password-setting requests are retained and require explicit review because the old shared role passwords are no longer used.

## Browser work and recovery

The original durable operation queue, draft keys and browser cache are preserved. Standalone role/name choices retain their previous actor identity so matching pending work can be retried under the same role. Hub actors keep the existing Name <email> identity. Work under a different actor/role is never silently reassigned. Download browser recovery is available on the entry screen; Pending / drafts retains the existing export and conflict review tools. Local work is cleared only after confirmed operation processing or an explicit archived resolution. A newer confirmed local revision blocks editing against an older migrated database.

## Validation

Run `node --test tests/*.test.cjs` on Node 24. Tests cover migration preservation, no legacy password copy, native codec, concurrent conflict retention, Viewer grants, idempotent retry, legacy replay, and rule predicates, plus retained legacy entry contracts. The rule tests evaluate authorization/validation expressions; Firebase Console validates the actual provider syntax during publishing. Workspace browser checks mock all writes and prove both standalone roles and hub access, denied elevation, cross-browser refresh, a complete migration setup and zero normal GitHub API requests. No production activity data is written by tests or deployment. There is no public activity snapshot or snapshot workflow.
