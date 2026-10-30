# Momentum OS

**One system. Every ambition. Continuous momentum.**

Momentum OS is a private operating workspace for turning long-term ambitions into monthly cycles, daily plans, creative work, relationships, and measurable outcomes. One owner can also invite a team into a deliberately separate shared workspace. November 2026 is the initial configuration—not a separate application or a permanent rule.

## What's included

- **Command Centre** separates today's plan from the selected month's paid sales and revenue, with outreach, creative progress, real follow-ups, upcoming sessions, and project visibility.
- **My Day** supports dated tasks, three high-priority outcomes, timeboxes, estimates and actual time, reordering, explicit carry-forward, focus mode, and daily reflections. Editable recurring plans are generated once when a local day is first opened; they start incomplete.
- **Course Growth** records products, paid/pending/refunded sales, enquiries, campaigns, and manually logged promotions. Only positive-amount records marked `paid` count as sales and realised revenue.
- **Client Pipeline** stores prospects, separate research dates and interaction records, follow-ups, deal values, and a separate job-application list. Only recorded outreach and sent follow-ups count as outreach; research and replies do not.
- **Creative Studio** manages briefs, deadlines, stages, output links, and project-to-content relationships. A completed stage records its actual completion time.
- **Next Chapter** manages sessions, guest details, a generated session checklist and linked planning tasks. Session content and AI-assisted content require explicit human approval before being marked published or distributed.
- **Personal Brand** manages an idea bank and date-ordered content list, platforms, drafts, project/session links, and manually recorded publication states. It does not publish externally.
- **Weekly Review** derives its numbers from recorded activity and saves reflections. Settings cover profile, working hours, timezone, recurring plans, platforms, theme, in-app attention badges, products, cycles, and JSON export.
- **Cycle rollover** archives the active cycle, accepts new targets and objectives, and optionally creates linked copies of unfinished tasks while marking the originals as carried. Projects, prospects, and content remain available. Historical sales and targets are retained. A reminder appears when an active cycle is in the past; rollover is deliberately user-initiated, not silent.
- **Team Workspace** shares intentionally created goals and assignments without sharing the owner's personal data. Members see shared goals, the team roster, and their own assignments and discussions. Owners and managers can manage and review shared work. Assigned team work appears separately in the owner's My Day when due and never changes personal task metrics. Team members get their own Momentum OS portal and appearance preference.

Appearance follows the phone or computer's light/dark setting by default and updates when the device changes. In **Settings → General → Appearance**, choose a fixed Light or Dark mode if preferred, then save. Untouched legacy dark defaults are switched to the device setting; existing saved appearance choices and workspace records are retained.

Initial values are editable: **Graphic Design with AI** at ₦14,900, 68 paid sales, ₦1,013,200 revenue target, 20 daily outreach actions, two weekly creative projects, a Friday Next Chapter cadence, Tuesday/Wednesday/Friday course publishing, Africa/Lagos, and 08:00–17:00 work hours. Initial tasks are _plans_, not completed activity; no sales or engagement are fabricated.

## Architecture

The interface uses React, TypeScript, Vite, and a reusable component/design system. An Express API persists data in a relational SQLite database using Node's built-in `node:sqlite` (currently marked experimental by Node). It is an independently deployable alternative to a managed database for this one-owner, one-team MVP. No connected Supabase project has been changed or configured.

- **Permanent layer:** owner/profile and preferences, products, projects, prospects, jobs, sessions, and content.
- **Cycle and execution layer:** operating cycles and targets, tasks, sales, enquiries, campaigns/promotions, interactions, session checklists, daily notes, and weekly reviews. Links associate cycle-specific records with their cycle and connect content to projects or sessions.
- **History:** cycle-specific sales are never reset during rollover; the selected cycle determines monthly sales/revenue. Weekly and daily figures are computed from the dates and statuses of actual records. Archived cycles remain selectable.
- **Shared layer:** team workspaces, membership roles, invitations, goals, assignments, comments, and activity are stored separately from personal records. Goal progress is entered deliberately, not inferred from task states. Server-side filters and authorization—not just navigation—restrict what each account can read or change.
- **Privacy:** production mode has one owner account and invited team accounts. Passwords use bcrypt; random session and invitation tokens are stored as hashes. Sessions use HttpOnly cookies and CSRF protection. Personal APIs are owner-only. Team accounts receive no seeded personal cycles, tasks, or financial records. Input and cross-record references are validated server-side. The first owner account must be created immediately after deployment.

The schema is in `server/schema.sql`; personal API validation and cross-record rules are in `server/validation.ts` and `server/index.ts`; team authorization and workflow rules are in `server/team.ts`. `src/lib/metrics.ts` contains the derived personal reporting rules. Existing databases receive additive settings, account-type, and team-table migrations without deleting records. Accounts from the earlier GitHub team draft are classified as team-only; any personal rows it seeded for them are retained but no longer exposed through personal APIs. Future schema changes should be introduced as explicit, versioned migrations.

## Run locally

Requires **Node.js 22.13+** and npm. Node's SQLite API is experimental in the current runtime and may emit a warning.

```bash
npm ci
npm run dev
```

Open `http://localhost:5173`. On first use, create the owner account with an email and a password of at least 12 characters. The API listens on port 3001 and Vite proxies `/api` to it; browser code never calls a separate localhost service. The private local database defaults to `data/workspace/momentum.sqlite`. It is ignored by Git.

### Invite and work with a team

1. In a private HTTPS deployment, sign in as the owner and open **Team Workspace → Invite member**. Managers can invite members; only the owner can invite managers.
2. Enter the recipient's email and create the link. The application **does not send email**: copy the link and deliver it privately yourself. It is shown once, is valid for seven days, is bound to that email, and can be used once. A lost link can be revoked and recreated. A link is a bearer secret; this MVP does not independently verify control of the mailbox, so verify the recipient and share it securely. Existing accounts cannot yet be added to a team.
3. The recipient opens the link, enters the same email, creates a password of at least 12 characters, and signs in to their own team portal. Invited accounts have no access to the owner's personal API, finances, clients, tasks, or notes. All members can read shared goals and the team roster; members see only their own assignments and associated comments/activity. Owners and managers can see all **team** assignments, so do not put personal information in shared records.
4. An owner or manager creates a shared goal or assigns work to an active teammate. A different active owner/manager must be selected as reviewer. The assignee starts and submits the work with a description or link; the designated manager or the owner reviews it, requests changes with feedback, or explicitly approves it. The assignee cannot approve their own work. The owner can replace an unavailable reviewer after submission without changing the submitted work. Approved work can then be marked complete by the reviewer or owner. Goal progress remains a separate, manual input.
5. The owner can change member/manager roles, and the owner or a permitted manager can suspend and restore member access. Suspension revokes existing sessions. A manager cannot manage the owner or another manager. Team work refreshes on focus and periodically while the page is visible; a connection error is shown rather than silently treating stale data as current.

For an **isolated, unauthenticated sandbox only**:

```bash
npm run dev:preview
```

Preview uses a separate `data/preview` database and opens automatically. **Anyone with access to a preview URL can access its preview data. Do not use real private information in preview mode.** Preview mode is disabled when `NODE_ENV=production`; it is not a production authentication mechanism.

### Browser-only visual demo

To make a portable preview that opens directly in Chrome without running a server:

```bash
npm run build:preview
# Open preview-dist/index.html in your browser.
```

This demo is generated from a fresh set of default settings, not from your database. It runs the same interface with a browser-only demo adapter: changes remain in that browser's local storage, are not synced to the real application, and may be lost when browser data is cleared. The Team Workspace includes one clearly labelled sample teammate and a **Preview sample member** switch, so the assignment/review flow can be tried locally. This is not a real account or a security boundary; invitations are disabled in both the browser demo and the public sandbox. If browser storage is blocked, it falls back to memory and warns that changes will be lost on refresh. **It has no private account or secure backend; do not use it for sensitive information.** The authenticated SQLite application remains the real system of record. The generated `preview/index.html` checked into this public repository is this demo only and never contains private SQLite data. Rebuild it with `npm run build:preview` and copy `preview-dist/index.html` to `preview/index.html` before publishing an updated preview. It embeds `preview/screenshot.png` and `preview/screenshot-light.png` as clearly labelled dark/light visual fallbacks when a third-party previewer blocks scripts; update both screenshots when the interface changes.

```bash
npm test          # business rules, authentication, persistence, and rollover
npm run build     # type-check and build the client
npm start         # serve the built client and API in production mode
```

## Deployment and environment

Copy `.env.example` to `.env` if desired, or provide environment variables through your host. The server reads `.env` with `dotenv`; process environment variables take precedence.

| Variable            | Purpose                                                     | Default                                              |
| ------------------- | ----------------------------------------------------------- | ---------------------------------------------------- |
| `PORT`              | API / production web server port                            | `3001`                                               |
| `DATA_DIR`          | Directory for the SQLite database                           | `./data/workspace` (or `./data/preview` for preview) |
| `MOMENTUM_API_PORT` | Optional Vite proxy target port when different from `PORT`  | `PORT` / `3001`                                      |
| `MOMENTUM_PREVIEW`  | `1` enables insecure sandbox sign-in in non-production only | disabled                                             |
| `NODE_ENV`          | `production` enables secure cookies and serves `dist`       | development                                          |

For production, run `npm ci`, `npm run build`, then `npm start` behind an HTTPS reverse proxy. Set `DATA_DIR` to a **durable, private, writable volume**; application files and ephemeral containers alone are not durable storage. Protect the initial setup URL and create the owner account immediately. The proxy should strip untrusted forwarded headers and apply its own rate limiting. Secure cookies require HTTPS for remote access. Back up the database volume regularly using a SQLite-consistent backup (or stop the server before copying the database and its WAL files); the in-app JSON export is an additional portable backup. Do not commit databases, exports containing personal information, `.env`, or credentials.

This SQLite deployment is intended for **one server instance / one owner and one shared team**, not serverless or multi-instance shared storage. A managed PostgreSQL/Supabase deployment and multi-device cloud hosting would need a separate adapter and migration. The current sandbox preview is not such a deployment. The in-app JSON export includes personal records and shared team work but omits passwords, sessions, and invitation token hashes; it cannot restore accounts. A durable SQLite backup is required for full recovery.

## Deliberate limits / future phases

This is a working MVP, not the entire long-term specification. Not yet implemented: managed Supabase/cloud sync, account recovery, email delivery or independent mailbox verification, adding existing accounts to a team, multiple team workspaces, in-app JSON restore or CSV export, external integrations or notifications, file uploads, automatic session generation, a drag-and-drop calendar, dedicated guest/customer directories, detailed campaign/content performance analytics, and a dedicated end-of-month review form. Campaign results, session transcripts, guest names, and other context can currently be recorded as notes or fields. Project/task time is entered manually. No AI drafting, payment processing, WhatsApp/email sending, or publishing is performed by the app. The user must explicitly record those actions elsewhere and log what actually happened.

## GitHub

This checkout already has `origin` configured for `Sainchigreat/Personal-Dashboad`; the repository is the source of application code, not of private database records. Continue development on the existing Arena session branch. To sync after reviewing the changes:

```bash
git status
git diff
# Commit your reviewed changes if they have not already been committed.
git push origin arena/a531ed6e-personal-dashboad
```

Open a pull request from that branch when you want to merge the work. No repository credentials are needed in the codebase.
