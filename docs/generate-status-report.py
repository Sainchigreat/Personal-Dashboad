#!/usr/bin/env python3
"""Generate the Momentum OS Complete Work & Status Report PDF.

Reproducible: python3 docs/generate-status-report.py
Requires: reportlab (pip install reportlab)
All content is evidence-based; see docs/SUPABASE-AUDIT.md for the live audit.
"""
from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

OUT = Path(__file__).resolve().parent / "Momentum-OS-Complete-Work-and-Status-Report.pdf"
W = 174 * mm

NAVY = colors.HexColor("#12233F")
ACCENT = colors.HexColor("#2563EB")
GREEN = colors.HexColor("#15803D")
AMBER = colors.HexColor("#B45309")
RED = colors.HexColor("#B91C1C")
SLATE = colors.HexColor("#475569")
LIGHT = colors.HexColor("#F1F5F9")
BORDER = colors.HexColor("#CBD5E1")
WHITE = colors.white

STATUS_COLOR = {
    "DONE": "#15803D",
    "VERIFIED": "#15803D",
    "PARTIAL": "#B45309",
    "NOT VERIFIED": "#B45309",
    "NOT DONE": "#B91C1C",
    "ISSUE": "#B91C1C",
    "OPEN": "#B45309",
}

ss = getSampleStyleSheet()
S = {}
S["Title"] = ParagraphStyle("Title", parent=ss["Normal"], fontName="Helvetica-Bold",
                            fontSize=27, leading=31, textColor=WHITE, alignment=TA_LEFT)
S["TitleSub"] = ParagraphStyle("TitleSub", parent=ss["Normal"], fontName="Helvetica",
                               fontSize=12.5, leading=17, textColor=colors.HexColor("#BFDBFE"))
S["H1"] = ParagraphStyle("H1", parent=ss["Normal"], fontName="Helvetica-Bold",
                         fontSize=15, leading=19, textColor=NAVY, spaceBefore=13, spaceAfter=6)
S["H2"] = ParagraphStyle("H2", parent=ss["Normal"], fontName="Helvetica-Bold",
                         fontSize=11, leading=14, textColor=ACCENT, spaceBefore=9, spaceAfter=4)
S["Body"] = ParagraphStyle("Body", parent=ss["Normal"], fontName="Helvetica",
                           fontSize=9.2, leading=13.2, textColor=colors.HexColor("#1E293B"))
S["Small"] = ParagraphStyle("Small", parent=ss["Normal"], fontName="Helvetica",
                            fontSize=8, leading=11, textColor=SLATE)
S["Cell"] = ParagraphStyle("Cell", parent=ss["Normal"], fontName="Helvetica",
                           fontSize=8, leading=10.6, textColor=colors.HexColor("#1E293B"))
S["CellH"] = ParagraphStyle("CellH", parent=ss["Normal"], fontName="Helvetica-Bold",
                            fontSize=8, leading=10.6, textColor=WHITE)
S["Bullet"] = ParagraphStyle("Bullet", parent=S["Body"], leftIndent=11,
                             bulletIndent=2, spaceAfter=2.5)
S["CoverMeta"] = ParagraphStyle("CoverMeta", parent=ss["Normal"], fontName="Helvetica",
                                fontSize=9, leading=13, textColor=colors.HexColor("#1E293B"))
S["CoverMetaB"] = ParagraphStyle("CoverMetaB", parent=S["CoverMeta"],
                                 fontName="Helvetica-Bold", textColor=NAVY)


def esc(text):
    return (str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def P(text, style="Body"):
    return Paragraph(esc(text), S[style])


def PR(markup, style="Body"):
    return Paragraph(markup, S[style])


def B(text):
    return f"<b>{esc(text)}</b>"


def st(label):
    color = STATUS_COLOR.get(label, "#475569")
    return Paragraph(f'<font color="{color}"><b>{label}</b></font>', S["Cell"])


def table(headers, rows, widths, font=8):
    data = [[Paragraph(esc(h), S["CellH"]) for h in headers]]
    for row in rows:
        data.append([c if isinstance(c, Paragraph) else P(c, "Cell") for c in row])
    t = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.4, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style.append(("BACKGROUND", (0, i), (-1, i), LIGHT))
    t.setStyle(TableStyle(style))
    return t


def bullets(items):
    return [Paragraph(f"•&nbsp;&nbsp;{esc(item)}", S["Bullet"]) for item in items]


def numbered(items):
    out = []
    for i, item in enumerate(items, 1):
        out.append(Paragraph(f"<b>{i}.</b>&nbsp;&nbsp;{esc(item)}", S["Bullet"]))
    return out


def divider():
    t = Table([[""]], colWidths=[W], rowHeights=[2])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), ACCENT)]))
    return t


# ---------------------------------------------------------------- page chrome
def first_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, A4[1] - 62 * mm, A4[0], 62 * mm, fill=1, stroke=0)
    canvas.setFillColor(ACCENT)
    canvas.rect(0, A4[1] - 64 * mm, A4[0], 2 * mm, fill=1, stroke=0)
    canvas.setFont("Helvetica-Bold", 8)
    canvas.setFillColor(colors.HexColor("#93C5FD"))
    canvas.drawString(18 * mm, A4[1] - 18 * mm, "MOMENTUM OS  /  ARENA AGENT MODE")
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(SLATE)
    canvas.drawString(18 * mm, 10 * mm,
                      "Momentum OS - Complete Work & Status Report  |  2 November 2026  |  Evidence-based")
    canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, "Page 1")
    canvas.restoreState()


def later_pages(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica-Bold", 7.5)
    canvas.setFillColor(NAVY)
    canvas.drawString(18 * mm, A4[1] - 12 * mm, "MOMENTUM OS - COMPLETE WORK & STATUS REPORT")
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(SLATE)
    canvas.drawRightString(A4[0] - 18 * mm, A4[1] - 12 * mm, "Sainchigreat/Personal-Dashboad")
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(18 * mm, A4[1] - 14 * mm, A4[0] - 18 * mm, A4[1] - 14 * mm)
    canvas.drawString(18 * mm, 10 * mm, "2 November 2026  |  Branch arena/0d207c00-personal-dashboad  |  PR #4 open")
    canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()


story = []

# ---------------------------------------------------------------------- cover
story += [
    Spacer(1, 4 * mm),
    Paragraph("MOMENTUM OS", S["Title"]),
    Spacer(1, 2 * mm),
    Paragraph("Complete Work, Status &amp; Gap Report", S["TitleSub"]),
    Paragraph("Everything worked on, everything done, everything not working, everything not done",
              S["TitleSub"]),
    Spacer(1, 12 * mm),
]

meta = [
    ["Prepared for", "Sainchigreat (repository owner)"],
    ["Generated", "2 November 2026, Africa/Lagos"],
    ["Repository", "Sainchigreat/Personal-Dashboad (public)"],
    ["Working branch", "arena/0d207c00-personal-dashboad"],
    ["Pull request", "#4 - OPEN against main (https://github.com/Sainchigreat/Personal-Dashboad/pull/4)"],
    ["Supabase project", "Momentum / ppfjotymclhbihkjvyxt / eu-west-2 / ACTIVE_HEALTHY"],
    ["Head commit", "d428730 (pushed to origin)"],
    ["Source of truth", "docs/SUPABASE-AUDIT.md, Git history, live Supabase SQL, CI logs"],
]
story += [
    Table([[Paragraph(B(k), S["CoverMetaB"]), Paragraph(esc(v), S["CoverMeta"])]
           for k, v in meta],
          colWidths=[38 * mm, W - 38 * mm],
          style=TableStyle([
              ("VALIGN", (0, 0), (-1, -1), "TOP"),
              ("LINEBELOW", (0, 0), (-1, -1), 0.35, BORDER),
              ("TOPPADDING", (0, 0), (-1, -1), 3.5),
              ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
          ])),
    Spacer(1, 8 * mm),
]

story += [P("STATUS LEGEND", "H2"),
          table(["Marker", "Meaning"],
                [[st("DONE"), P("Built, committed, pushed and verified")],
                 [st("PARTIAL"), P("Built and committed, but only partly wired or only partly verified")],
                 [st("NOT DONE"), P("Not attempted / deliberately deferred; listed in the open checklist")],
                 [st("ISSUE"), P("Known limitation, risk or environmental blocker")],
                 [st("NOT VERIFIED"), P("Cannot be confirmed from this sandbox; not claimed as working")]],
                [30 * mm, W - 30 * mm]),
          Spacer(1, 7 * mm)]

story += [PageBreak()]

# At-a-glance summary opens the report body (kept off the cover to avoid a
# nearly empty second page).
story += [P("At a glance", "H1"), divider(), Spacer(1, 3 * mm),
          table(["Area", "Status", "One-line truth"],
                [["GitHub discovery", st("DONE"), P("Repo found; main had only a README; full app recovered from another branch")],
                 ["Supabase database", st("DONE"), P("4 migrations, 30 public + 29 momentum_os tables, 41 RLS policies, live API")],
                 ["Safe connection", st("DONE"), P("Real write/read round trip; no new project, no data deleted")],
                 ["App + Cloud page", st("DONE"), P("Cloud page is Supabase-backed; all workspace pages now use one async API backed by PostgreSQL when DATABASE_URL is set")],
                 ["Build / tests / CI", st("VERIFIED"), P("Build passes, 65 tests / 14 files pass (10 PostgreSQL + 8 Netlify Function acceptance), Actions green")],
                 ["Live preview", st("DONE"), P("Dev preview on 5173 / API 3001 plus the real production build dist/ served on 4173")],
                 ["Netlify deployment", st("NOT VERIFIED"), P("Deployment BLOCKED: no connector/token/site ID and api.netlify.com unreachable; config, Function, env vars and verification script are ready")],
                 ["Netlify config + Function", st("VERIFIED"), P("netlify.toml, routing, path normalisation, 8 handler tests and the deploy verification script all pass")],
                 ["Express -> PostgreSQL", st("DONE"), P("All three server files awaited; verified against a real PostgreSQL engine and live Supabase SQL shapes")],
                 ["Production go-live", st("NOT DONE"), P("PR #4 not merged; no owner account; signup still open; no external deploy")]],
                [34 * mm, 24 * mm, W - 58 * mm]),
          Spacer(1, 4 * mm),
          P("This report deliberately separates what was PROVEN from what was only BUILT "
            "or DEFERRED. Nothing is described as live or connected without a recorded check.", "Small"),
          Spacer(1, 4 * mm)]

# ------------------------------------------------------- 1. executive summary
story += [P("1. Executive summary", "H1"), divider(), Spacer(1, 3 * mm)]
story += [P("You asked me to find the Personal Dashboard code in the connected GitHub account, "
            "explain what it does, build a Momentum AI database in the Supabase project you had "
            "already created (named Momentum), make it live, show a preview, say whether it could "
            "be shipped, and then safely inspect and connect to that exact project without creating "
            "a new one or deleting data.", "Body"),
          Spacer(1, 2 * mm),
          P("I found the code (React 19 + TypeScript + Vite 6 + Express 4 + node:sqlite), recovered "
            "the full Momentum OS application from a non-default branch, and used ONLY the existing "
            "Supabase project. I built a PostgreSQL schema with RLS, reporting views, RPCs, audit "
            "trail, a deterministic planner/AI brief, a deployed Edge Function API, a browser "
            "Momentum Cloud page, and later an additive legacy-compatible schema plus a server-side "
            "pg layer, Netlify configuration and documentation, and finally the completed async "
            "Express-to-PostgreSQL conversion. Everything was committed and pushed "
            "to the session branch and is in open PR #4.", "Body"),
          Spacer(1, 2 * mm),
          P("VERIFIED: production build, 57 automated tests (10 PostgreSQL acceptance), green CI, "
            "live Edge Function /health, "
            "a real server-side database write/read persistence round trip, RLS owner-vs-team "
            "isolation, and an in-app live preview.", "Body"),
          Spacer(1, 2 * mm),
          P("NOT VERIFIED / NOT DONE: an external Netlify production deployment, an owner account, "
            "production signup lockdown, a real LLM, scheduled jobs, and merging PR #4. The Netlify "
            "Functions wrapper is ready and fails closed only when DATABASE_URL is missing.", "Body"),
          Spacer(1, 4 * mm)]

story += [P("2. What you asked for (chronological)", "H1"), divider(), Spacer(1, 3 * mm)]
story += bullets([
    "Look at the connected GitHub account for 'Personal' / 'Personal Dashboard'; check whether it is there, check it out, check the entire code, and explain what is happening in it.",
    "You are building Momentum AI and need a database built on Supabase, in a project you would create and name Momentum.",
    "Then I need it live. When you are done I'd like to see the preview.",
    "Okay you can now ship it or you cannot push it live?",
    "There is now a Momentum project on Supabase; work with it and build me a backend for what I am doing.",
    "But the website is already deployed on Netlify; can't you see it from your end?",
    "Inspect this exact project, check its existing tables and migrations, and implement the connection safely. No new project, no unnecessary data deletion. (Attached: 5-page implementation specification PDF.)",
    "Create a PDF of everything worked on, everything not working, everything done and everything not done.",
])

# ------------------------------------------------------------- 3. discovery
story += [P("3. Discovery - GitHub and the existing code", "H1"), divider(), Spacer(1, 3 * mm)]
story += [table(["Item", "Finding"],
                [["Connected account", P("Sainchigreat; one public repo, Sainchigreat/Personal-Dashboad, created 2026-11-01")],
                 ["main branch", P("Only README.md, single commit 2f4cf10. Checking only main was a dead end.")],
                 ["Full application", P("arena/a531ed6e-personal-dashboad at dbcd5da: 74 files, 10 commits, complete Momentum OS app")],
                 ["PR history", P("#1 and #2 closed as superseded; #3 'Add Goal Engine and automatic daily planning' already merged into that branch")],
                 ["Stack", P("React 19, TypeScript, Vite 6, Express 4, node:sqlite (DatabaseSync), bcryptjs, Zod, Helmet, Vitest")],
                 ["Auth model", P("Custom: bcrypt password hashes, hashed opaque session tokens, HttpOnly cookies, CSRF tokens, owner/team account separation")],
                 ["Data layer", P("server/schema.sql (28 tables), server/db.ts, server/index.ts, server/team.ts; frontend calls relative /api via src/lib/api.ts")],
                 ["Goal Engine", P("Daily routines (WhatsApp course promotion, enquiry follow-up, 20 targeted outreach actions, end-of-day reflection), 5/6/8 AM review reminders, weekday creative/project/publishing blocks, Friday live prep, weekend batching, 7-day-ahead guest confirmation, up to 8 overdue tasks carried forward, monthly goal breakdown")],
                 ["November target", P("68 course sales / NGN 1,013,200 at NGN 14,900; generated items are plans only, never fabricated completed work")],
                 ["Branch note", P("The attached specification names arena/a531ed6e-personal-dashboad as target; this session is fixed to arena/0d207c00-personal-dashboad")]],
                [34 * mm, W - 34 * mm])]

# ------------------------------------------------------------- 4. supabase
story += [P("4. The exact Supabase project - before and after", "H1"), divider(), Spacer(1, 3 * mm)]
story += [P("Identity (verified via Supabase connector)", "H2"),
          table(["Field", "Value"],
                [["Name / ref", P("Momentum / ppfjotymclhbihkjvyxt")],
                 ["Region / org", P("eu-west-2 / gcjpvspkpwizoizxwtok")],
                 ["Status", P("ACTIVE_HEALTHY - auth, db, pooler, pg_bouncer, rest, storage all healthy")],
                 ["Database", P("PostgreSQL 17.11, host db.ppfjotymclhbihkjvyxt.supabase.co")],
                 ["Created", P("2026-11-02T00:45:51Z")],
                 ["Visibility", P("Exactly ONE project is visible to the connected credential. No second Supabase account could be inspected.")],
                 ["New project?", P("NO. No create_project call was made; the spec's warning about a second account could not be resolved from here.")]],
                [34 * mm, W - 34 * mm]),
          Spacer(1, 4 * mm)]
story += [P("Schema and data - before this turn's work vs. now", "H2"),
          table(["Object", "Before (start of session)", "Now"],
                [["public tables", P("0 operational tables (empty project)"), P("30, all RLS-enabled")],
                 ["Rows in public", P("0"), P("0 - unchanged; nothing deleted")],
                 ["Versioned migrations", P("0"), P("4 (3 original + 1 additive compat)")],
                 ["RLS policies", P("0"), P("41")],
                 ["SQL functions / views", P("0 / 0"), P("12 / 3 (security_invoker views)")],
                 ["Triggers / FKs / indexes", P("0 / 0 / 0"), P("30 public + 1 auth.users / 56 / 52")],
                 ["Edge Functions", P("0"), P("1 - momentum-api, ACTIVE, version 1")],
                 ["auth.users / identities", P("0 / 0"), P("0 / 0 - no owner account created")],
                 ["momentum_os schema", P("did not exist"), P("29 tables (28 exact translations + integration_checks), 52 FKs, 47 indexes, 1 metadata row")],
                 ["Local SQLite data", P("none"), P("none - data/ absent; no production rows to import or back up")]],
                [34 * mm, 62 * mm, W - 96 * mm])]


# ------------------------------------------------------------- 5. done
story += [P("5. Everything DONE", "H1"), divider(), Spacer(1, 3 * mm)]
story += [P("5.1 Database and backend", "H2"),
          table(["Deliverable", "Detail", "Status"],
                [["Migration 1 - momentum_core_schema", P("30 public tables: profiles, settings, cycles, products, projects, chapter_sessions, tasks, generated_days, sales, leads, campaigns, promotions, prospects, interactions, jobs, content_items, session_checklists, daily_notes, weekly_reviews, 7 team tables, 3 AI tables, activity_events. Indexes, updated_at triggers, on_auth_user_created -> handle_new_user() with owner seed rows."), st("DONE")],
                 ["Migration 2 - momentum_rls", P("RLS on all 30 tables. Helpers current_account_type, is_owner, is_workspace_member, is_workspace_manager. Owner-only own_rows policy (user_id = auth.uid()), team membership/role policies, anon revocation."), st("DONE")],
                 ["Migration 3 - momentum_api", P("RPCs command_centre, workspace_bootstrap, ensure_daily_plan, generate_ai_suggestions, momentum_health; views v_open_tasks, v_sales_summary, v_ai_inbox; log_activity() audit triggers on 7 tables."), st("DONE")],
                 ["Migration 4 - momentum_os_compat", P("Additive only. CREATE SCHEMA/TABLE/INDEX IF NOT EXISTS for the exact server/schema.sql translation, preserving TEXT UUID ids, users + auth_sessions, 52 FKs, cascade/set-null, 9 indexes, plus metadata-only integration_checks. No DROP/TRUNCATE/DELETE/ALTER."), st("DONE")],
                 ["Edge Function momentum-api", P("Deployed ACTIVE, id a439832a-db54-4858-b90e-54de92a4af80, verify_jwt=false because it validates the JWT itself via auth.getUser(). Public GET /health; JWT GET /me, /bootstrap, /metrics, /ai/suggestions, /resources; POST /planner/ensure, /ai/brief; whitelisted resource GET/POST/PATCH/DELETE."), st("DONE")],
                 ["Behaviour rules", P("Only paid sales with amount>0 count as revenue; only interactions.kind='outreach' count as outreach; daily planner is idempotent per local day, editable status='todo', never fabricates completed work; AI is deterministic rules-v1, deduped suggestions (pending/accepted/dismissed), daily briefs and ai_runs logged."), st("DONE")],
                 ["Auth configuration", P("disable_signup=false and mailer_autoconfirm=true so the first owner can sign up without SMTP. jwt_exp 3600; no external providers."), st("DONE")]],
                [40 * mm, W - 62 * mm, 22 * mm]),
          Spacer(1, 4 * mm)]

story += [P("5.2 Application, connection and deployment wiring", "H2"),
          table(["Deliverable", "Detail", "Status"],
                [["Browser cloud client", P("src/lib/cloud.ts - typed Supabase client: health, me, bootstrap, metrics, planner, AI brief, suggestions, resource CRUD, sign-up/sign-in/sign-out, session watcher. Uses @supabase/supabase-js 2.118.0."), st("DONE")],
                 ["Momentum Cloud page", P("src/pages/Cloud.tsx + src/styles/cloud.css: live health, owner sign-up/sign-in, metrics, planner, AI brief, suggestion inbox with accept/dismiss. Wired into App.tsx, Shell.tsx, store.tsx, types.ts."), st("DONE")],
                 ["Server-side pg layer", P("server/postgres.ts - lazy pg 8.23.1 pool from DATABASE_URL, ? -> $n translation, INSERT OR IGNORE -> ON CONFLICT DO NOTHING, BEGIN IMMEDIATE -> BEGIN, table qualification, SQLite error mapping, transactions, checkPostgresConnection() round trip."), st("DONE")],
                 ["Connection endpoint", P("GET /api/pg/health - real DB round trip, Cache-Control no-store, fails closed with 503 when DATABASE_URL is absent, never leaks the connection string."), st("DONE")],
                 ["Verification + import scripts", P("scripts/verify-db.ts (npm run verify:db) and scripts/import-sqlite.ts (npm run import:sqlite) - FK-safe order, ON CONFLICT DO NOTHING, two-pass tasks self-FK restore, row-count report, no deletion."), st("DONE")],
                 ["Netlify configuration", P("netlify.toml - npm run build, publish dist, functions netlify/functions, Node 22, /api/* redirect BEFORE SPA fallback, security headers. Env var NAMES documented, no values."), st("DONE")],
                 ["server/index.ts export", P("Express app exported without auto-listening (MOMENTUM_IMPORT_ONLY), so the Netlify Function can wrap it."), st("DONE")],
                 ["CSP", P("Production connect-src extended to include VITE_SUPABASE_URL so the browser can reach Supabase."), st("DONE")],
                 ["Async conversion (COMPLETED)", P("Every db.prepare().get/all/run and db.exec() in server/db.ts, server/index.ts and server/team.ts is awaited; all helpers, middleware and route handlers are async. One Db interface with SQLite (local) and PostgreSQL (DATABASE_URL) backends; per-request AsyncLocalStorage client keeps BEGIN/COMMIT/ROLLBACK atomic; forEach insert loops became awaited for...of."), st("DONE")],
                 ["express-async-errors", P("Side-effect patch so Express 4 forwards rejected async handlers to the existing error middleware; response shapes, Zod validation, CSRF, ownership/role checks and export redaction preserved."), st("DONE")],
                 ["Netlify Functions wrapper", P("Now serves the async PostgreSQL API whenever DATABASE_URL is set; fails closed with 503 only when the secret is missing, preventing an accidental ephemeral SQLite fallback."), st("DONE")]],
                [40 * mm, W - 62 * mm, 22 * mm]),
          Spacer(1, 4 * mm)]

story += [P("5.3 Documentation, tests and repository hygiene", "H2"),
          table(["Deliverable", "Detail", "Status"],
                [["docs/SUPABASE-AUDIT.md", P("Full evidence-based audit: exact project identity, pre-existing objects, data counts, additive changes, architecture reconciliation, round-trip proof, env var names, status table."), st("DONE")],
                 ["README.md / supabase/README.md", P("Cloud backend architecture, env vars, integration status, limitations, two-schema reconciliation, PR/branch instructions."), st("DONE")],
                 [".env.example / .env.local", P("Documents server-only DATABASE_URL and public VITE_* names. .env.local is gitignored and holds only the publishable key; no service-role or DB password in Git."), st("DONE")],
                 ["Unit + acceptance tests", P("tests/postgres.test.ts (6), tests/pg-health.test.ts (2), tests/postgres-integration.test.ts (10) and tests/netlify-function.test.ts (8, Netlify-shaped events + real PostgreSQL) added; 14 files / 65 tests pass."), st("DONE")],
                 ["CI workflow", P(".github/workflows/ci.yml includes the session branch; Actions run 41392237352 green (verify in 31s)."), st("DONE")],
                 ["Secret scan", P("git grep found no connection strings, service-role keys or DB passwords in tracked files; only a commented placeholder."), st("DONE")],
                 ["Git state recovery", P("Sandbox re-cloned .git (HEAD back at 2f4cf10) while keeping working files; re-synced with a non-destructive reset --mixed to the remote 414efd2. Nothing lost."), st("DONE")],
                 ["Commit + push + PR", P("414efd2 (20 files / 2541 insertions) and d428730 (16 files / 1437 insertions) pushed. PR #4 open with audit + conversion comments; 18 commits."), st("DONE")],
                 ["Netlify deployment kit", P("netlify.toml (esbuild, external express, /api/* before SPA fallback, [dev] block), netlify/functions/api.ts (path normalisation + fail-closed), scripts/verify-netlify.mjs (read-only + --acceptance), docs/NETLIFY-DEPLOYMENT.md (exact env vars and commands)."), st("DONE")]],
                [40 * mm, W - 62 * mm, 22 * mm])]


# ------------------------------------------------------- 6. verification
story += [P("6. Verification evidence", "H1"), divider(), Spacer(1, 3 * mm)]
story += [table(["Check", "Result", "How it was proven"],
                [["Production build", st("VERIFIED"), P("npm run build - tsc --noEmit + vite build succeed; only a >500 kB chunk-size advisory")],
                 ["Automated tests", st("VERIFIED"), P("npm test - 14 files, 65 tests passing (47 SQLite-mode + 10 PostgreSQL + 8 Netlify Function)")],
                 ["GitHub Actions CI", st("VERIFIED"), P("gh run watch 41392237352 --exit-status - green; only Node 20 action deprecation / Ubuntu label annotations")],
                 ["Live Edge Function /health", st("VERIFIED"), P("Public fetch: {\"status\":\"ok\",\"tables\":30,\"policies\":41,\"rpc_functions\":12,\"rls_enabled_tables\":30,\"database\":\"PostgreSQL 17.11\"}")],
                 ["Unauthenticated route guards", st("VERIFIED"), P("/bootstrap and /ai/suggestions without JWT both return {\"error\":\"Sign in to Momentum Cloud first.\"}")],
                 ["Real DB write/read round trip", st("VERIFIED"), P("INSERT into momentum_os.integration_checks in one request; SELECT in a SEPARATE request returned the same id, label, payload and created_at")],
                 ["Existing data preserved", st("VERIFIED"), P("Exact count(*) over all 30 public tables before and after: 0 rows; public tables still 30; 41 policies intact")],
                 ["Functional DB smoke test", st("VERIFIED"), P("Temp user produced 9 planner tasks, 3 AI suggestions, 20 bootstrap keys, 9 activity events, 1 daily brief; metrics 2026-11 with targets 68 / 1013200 / 20 and zero fabricated sales or outreach; transaction rolled back")],
                 ["RLS owner vs team isolation", st("VERIFIED"), P("Owner saw 1 settings/cycle/workspace/goal; team member: is_owner false, is_member true, visible_goals 1, personal tasks/cycles/settings 0; rolled back")],
                 ["pg translation unit tests", st("VERIFIED"), P("6 tests: placeholders, string literals, table qualification, BEGIN IMMEDIATE, PRAGMA, INSERT OR IGNORE, error mapping")],
                 ["Async Express API on PostgreSQL", st("VERIFIED"), P("10/10 acceptance tests with pg mocked by a real in-process PostgreSQL engine (PGlite) and the exact momentum_os migration: register + seeded defaults, CSRF rejection, idempotent daily plan, write/read persistence, atomic Next Chapter checklists, atomic cycle rollover, export redaction, team isolation, logout/login persistence")],
                 ["Translated SQL on the REAL project", st("VERIFIED"), P("COUNT(*)::int, qualified momentum_os tables, INSERT ... ON CONFLICT DO NOTHING, UPDATE and SELECT shapes executed in a transaction on the live Supabase DB and rolled back; final public rows = 0")],
                 ["Fail-closed endpoints", st("VERIFIED"), P("/api/pg/health returns 503 with no connection string; Netlify wrapper returns explicit 503 only when DATABASE_URL is missing")],
                 ["Netlify Function handler", st("VERIFIED"), P("8/8 tests with Netlify-shaped events and a real PostgreSQL engine: both redirect path shapes, 503 fail-closed without DATABASE_URL, /api/pg/health round trip, registration, CSRF rejection, write persistence and retrieval")],
                 ["Deploy verification script", st("VERIFIED"), P("npm run verify:netlify against the local production-build preview: 4 PASS / 1 WARN - frontend HTML, SPA fallback, auth status, 401 on unauthenticated bootstrap; WARN = /api/pg/health 503 because DATABASE_URL is not set")],
                 ["Netlify deploy attempt", st("NOT VERIFIED"), P("CLI: 'Authentication required. NETLIFY_AUTH_TOKEN is not set'; anonymous with functions: 'require authentication'; anonymous static: 'TypeError: fetch failed'. curl + node fetch to api.netlify.com both fail (SSL_ERROR_SYSCALL / ECONNRESET)")],
                 ["Live preview", st("VERIFIED"), P("Vite 5173, API 3001 and the production dist/ preview on 4173 all HTTP 200; /api/pg/health correctly fails closed with 503")]],
                [38 * mm, 24 * mm, W - 62 * mm]),
          Spacer(1, 4 * mm),
          P("Note on proof boundaries: the sandbox allows outbound traffic only to github.com, "
            "codeload.github.com, api.github.com, registry.npmjs.org, pypi.org and "
            "files.pythonhosted.org. Direct curl to Supabase REST fails. Database-side SQL ran "
            "through the Supabase connector (real server-side execution), and the public Edge "
            "Function URL was reached through the web fetch tool. The Node pg driver path is "
            "executed against a real PostgreSQL engine locally and the translated SQL shapes were "
            "executed server-side on the live Supabase database. What remains unproven is a "
            "deployed Netlify Function opening a network connection to Supabase.", "Small")]

# ------------------------------------------------------- 7. not working
story += [P("7. Everything NOT WORKING / known issues", "H1"), divider(), Spacer(1, 3 * mm)]
issues = [
    ("Netlify site cannot be seen", "Arena has no Netlify connector ('unsupported'); GitHub shows 0 deployments, 0 environments, no Netlify preview checks or PR comments, no homepage URL. Webhooks/secrets endpoints return 403 for this token. The Netlify CLI reports Authentication required; anonymous deploys are refused for functions and the static-only attempt fails with TypeError: fetch failed because api.netlify.com is unreachable from this sandbox. Web search found only unrelated sites (momentumos.space, momentum-os.netlify.app, lt-momentum-clone.netlify.app). The already-deployed site is therefore UNVERIFIED."),
    ("Static-only Netlify cannot run this app", "The API needs a Netlify Function plus DATABASE_URL. A publish=dist static deploy alone cannot serve /api; any currently live static site is likely the browser-only preview demo or an older build, NOT the Supabase backend."),
    ("Netlify env vars not configured", "DATABASE_URL and the public VITE_* values must be set in Netlify Site configuration -> Environment variables. I cannot set them from here."),
    ("Function fails closed without the secret", "With DATABASE_URL missing the wrapper returns 503 rather than silently falling back to an ephemeral SQLite file. This is intentional; it is NOT a code defect."),
    ("Live Node -> Supabase link unproven", "Outbound DB traffic is blocked from this sandbox. The pg path was verified with a real in-process PostgreSQL engine, through the Netlify Function handler, and with translated SQL executed server-side on the live DB. No deployed function has connected over the network. Run npm run verify:netlify and npm run verify:db on the host."),
    ("No owner account", "auth.users = 0. Nobody has signed in to Momentum Cloud yet; the owner workspace has not been created."),
    ("Public signup is still open", "disable_signup=false and mailer_autoconfirm=true, site_url http://localhost:3000, blank redirect allow list, no SMTP. Intentional for frictionless owner creation but a security risk until locked down. GoTrue minimum password is 6 while the UI enforces 12."),
    ("No real LLM, no scheduler", "generate_ai_suggestions is deterministic rules-v1. No model provider, no cron, no scheduled daily planner; the planner runs only when called."),
    ("Workspace pages still use /api + cookies", "src/lib/api.ts calls relative /api with custom bcrypt/cookie/CSRF auth. That API is now PostgreSQL-backed, but the browser does not use Supabase Auth or the Edge Function for those pages. Do not describe the whole app as Supabase-Auth-backed."),
    ("Two data models coexist", "public uses Supabase Auth + uuid + RLS; momentum_os uses the legacy TEXT UUID ids + custom bcrypt auth. This was the non-destructive reconciliation, but it needs a decision before production."),
    ("Spec deviation needs approval", "The attached spec says do not replace custom auth with Supabase Auth. The pre-existing public schema already uses Supabase Auth; dropping it was prohibited. The deviation is documented in docs/SUPABASE-AUDIT.md."),
    ("Preview mode is not production auth", "MOMENTUM_PREVIEW=1 is an isolated, unauthenticated SQLite database in data/preview; anyone with the URL can see demo data. Disabled when NODE_ENV=production. Not suitable for real personal data."),
    ("PR #4 not merged", "main still contains only README.md. Nothing goes live from main until the PR is merged."),
    ("Second Supabase account not visible", "The spec says the intended project may be in a second account. Only one project is visible to the connected credential; that possibility remains unresolved."),
    ("Other branch CI failing", "Run 41388145445 on arena/a531ed6e-personal-dashboad ('Migrate daily course partner task...') failed. It is not our branch and was left untouched."),
    ("Non-failing warnings", "Build chunk 646.79 kB (>500 kB advisory); GitHub Actions Node 20 deprecation and Ubuntu 26 label annotations; Node 22 node:sqlite ExperimentalWarning."),
    ("No production SQLite data", "data/ is absent, so the import script was never run against real rows and no backup/restore was needed or performed."),
    ("No deployed function logs", "Cold-start pool behaviour, HTTPS Secure cookies, sameSite, CSRF round trips and trusted proxy settings have NOT been confirmed on the Netlify HTTPS domain; no build/function logs are available here."),
]
story += [table(["#", "Issue", "Impact / current state"],
                [[P(str(i)), P(name), P(detail)] for i, (name, detail) in enumerate(issues, 1)],
                [8 * mm, 44 * mm, W - 52 * mm])]


# ------------------------------------------------------- 8. not done
story += [P("8. Everything NOT DONE - open checklist", "H1"), divider(), Spacer(1, 3 * mm)]
todo = [
    ("P0", "Set DATABASE_URL (and the public VITE_* values) in Netlify Site configuration -> Environment variables; verify the function cold-start pool, HTTPS Secure cookies, sameSite, CSRF round trips and trusted proxy settings.", "Not started"),
    ("P0", "Provide/confirm the Netlify site URL and which branch it builds; connect Netlify to this branch or merge PR #4 so the new code actually deploys.", "Waiting on URL / decision"),
    ("P0", "Run npm run verify:db and the full acceptance suite against the live Supabase project from a host with database access; confirm session expiry, duplicate-email handling and owner/manager/member roles on the deployed function.", "Not started"),
    ("P1", "Create the owner account from Momentum Cloud, then disable public signup, configure SMTP, set site_url and the redirect allow list.", "Not started"),
    ("P1", "Decide the single data model: keep both schemas, rewire pages to the cloud adapter, or retire one schema (with explicit approval, never a silent drop).", "Not started"),
    ("P1", "Verify the deployed /api routes and write/read persistence on the Netlify HTTPS domain; confirm build and function logs show no missing-module or SQL errors.", "Not started"),
    ("P2", "Connect a real LLM behind rules-v1 and add a cron/scheduled planner and brief generation.", "Not started"),
    ("P2", "Run scripts/import-sqlite.ts if real production SQLite data ever appears; compare row counts per table and keep the SQLite backup until confirmation.", "Not applicable - no data"),
    ("P2", "Merge PR #4 into main (only with your instruction).", "Not started"),
    ("P2", "Revisit the >500 kB bundle with code splitting; refresh deprecated GitHub Actions versions.", "Not started"),
]
story += [table(["Priority", "Outstanding item", "State"],
                [[P(p), P(item), st("NOT DONE") if state.startswith("Not") else P(state)]
                 for p, item, state in todo],
                [18 * mm, W - 48 * mm, 30 * mm]),
          Spacer(1, 4 * mm),
          P("Deliberately NOT done (by instruction or by design): no new Supabase project, no "
            "DROP/TRUNCATE/DELETE/ALTER on existing tables, no owner account created by me, no "
            "secret/service-role key committed, no merge of PR #4, no claim that an external "
            "production deployment works. The async Express-to-PostgreSQL conversion, previously "
            "an open P0 item, is now COMPLETE and verified.", "Small")]

# ------------------------------------------------------- 9. env vars
story += [P("9. Environment variables - NAMES ONLY (no values)", "H1"), divider(), Spacer(1, 3 * mm)]
story += [table(["Name", "Where it is set", "Exposure / state"],
                [["DATABASE_URL", P("Netlify Site configuration -> Environment variables; local .env.local"), P("SERVER-ONLY SECRET. Never VITE_, never committed, never logged. NOT SET here.")],
                 ["PG_POOL_MAX", P("Same"), P("Server-only, optional (default 5).")],
                                  ["MOMENTUM_IMPORT_ONLY", P("Set by the Netlify wrapper"), P("Server-only; stops app.listen() on import.")],
                 ["DATA_DIR / NODE_ENV / PORT / MOMENTUM_PREVIEW", P("Local / host"), P("Server-only; preview mode is isolated SQLite.")],
                 ["VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY", P(".env.local (gitignored) / Netlify"), P("PUBLIC publishable values only. Set locally; browser receives them.")],
                 ["SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL, SUPABASE_JWKS, SUPABASE_PUBLISHABLE_KEYS, SUPABASE_SECRET_KEYS", P("Injected by Supabase into the project"), P("Names only. Seven platform secrets exist; values are never repeated in this repo.")]],
                [46 * mm, 52 * mm, W - 98 * mm])]

# ------------------------------------------------------- 10. deliverables
story += [P("10. Commits, PR, CI and live artefacts", "H1"), divider(), Spacer(1, 3 * mm)]
story += [table(["Artefact", "Detail"],
                [["2f4cf10", P("Initial commit on main - README.md only")],
                 ["dbcd5da", P("Full Momentum OS app recovered from arena/a531ed6e-personal-dashboad (fast-forward)")],
                 ["414efd2", P("feat: build Momentum AI backend on Supabase - 20 files, 2541 insertions")],
                 ["d428730", P("feat: safely connect Momentum OS to the existing Supabase project - 16 files, 1437 insertions")],
                 ["fc13437 / 9be221f", P("Complete work & status report PDF + reproducible generator; ignore Python bytecode")],
                 ["27e4b7b", P("feat: Netlify deployment readiness, function routing, deploy verification script, 8 handler tests and deployment guide")],
                 ["PR #4", P("OPEN against main, https://github.com/Sainchigreat/Personal-Dashboad/pull/4, 18 commits, CI green, audit comment added")],
                 ["CI runs", P("41385820560, 41385805019, 41392237352, 41393367495, 41393373991, 41413966836 and 41414096251 all green")],
                 ["Live API", P("https://ppfjotymclhbihkjvyxt.supabase.co/functions/v1/momentum-api/health returns status ok")],
                 ["Live preview", P("Process momentum-os-f7d6e877 (dev preview 5173 / API 3001) and momentum-os-production-build-pre-7081534f (dist/ on 4173); both HTTP 200")],
                 ["Key report", P("docs/SUPABASE-AUDIT.md - evidence-based audit; docs/NETLIFY-DEPLOYMENT.md - deploy guide, exact env vars and blockers")]],
                [34 * mm, W - 34 * mm])]

# ------------------------------------------------------- 11. next steps
story += [P("11. Recommended next steps (in order)", "H1"), divider(), Spacer(1, 3 * mm)]
story += numbered([
    "Give me the Netlify site URL / site ID, or connect Netlify in Arena / provide NETLIFY_AUTH_TOKEN plus NETLIFY_SITE_ID. Then I can deploy a real preview from this branch and report the actual URL.",
    "Set DATABASE_URL in Netlify (server-only secret) so the now-active async API uses the momentum_os schema instead of falling back to SQLite.",
    "Run npm run verify:db and the acceptance suite from the host, then confirm cookies, CSRF, isolation, planner idempotency and cold-start persistence on the deployed function.",
    "Create the owner account from Momentum Cloud, then disable public signup, configure SMTP and set the correct site URL / redirect allow list.",
    "Only after the above: merge PR #4 and verify the production /api health and a write/read persistence round trip on the Netlify domain.",
])

# ------------------------------------------------------- appendix
story += [P("Appendix A - Key files", "H1"), divider(), Spacer(1, 3 * mm)]
story += [table(["Path", "Purpose"],
                [["supabase/migrations/20261102000100_momentum_core.sql", P("Core 30-table schema, triggers, signup bootstrap")],
                 ["supabase/migrations/20261102000200_momentum_rls.sql", P("RLS on all 30 tables, helper functions, policies")],
                 ["supabase/migrations/20261102000300_momentum_api.sql", P("RPCs, views, audit triggers")],
                 ["supabase/migrations/20261102000400_momentum_os_compat.sql", P("Additive legacy-compatible PostgreSQL schema (this turn)")],
                 ["supabase/functions/momentum-api/index.ts", P("Deployed Edge Function source of truth")],
                 ["supabase/README.md", P("Backend schema / API / security / limits documentation")],
                 ["docs/SUPABASE-AUDIT.md", P("Evidence-based audit, reconciliation, round-trip proof, status table")],
                 ["src/lib/cloud.ts", P("Typed browser Supabase client and API helpers")],
                 ["src/pages/Cloud.tsx", P("Momentum Cloud page (Supabase-backed)")],
                 ["src/lib/api.ts", P("Existing local /api client - the seam for the remaining adapter switch")],
                 ["server/postgres.ts", P("Server-only pg pool, ALS transaction context, SQL translation, error mapping, round trip")],
                 ["server/db.ts", P("Dual-backend async Db: SQLite locally, momentum_os/PostgreSQL with DATABASE_URL")],
                 ["server/express-async-errors.d.ts", P("Type declaration for the Express 4 async-error patch")],
                 ["server/index.ts", P("Express app, /api/pg/health probe, exported app without auto-listen")],
                 ["netlify.toml / netlify/functions/api.ts", P("Build, redirects, headers and the active Netlify Functions wrapper")],
                 ["scripts/verify-netlify.mjs", P("Deployed-site verification: health, auth, persistence, retrieval")],
                 ["docs/NETLIFY-DEPLOYMENT.md", P("Exact env vars, deploy commands, blockers and next actions")],
                 ["tests/netlify-function.test.ts", P("8 Netlify-shaped handler acceptance tests")],
                 ["scripts/verify-db.ts / scripts/import-sqlite.ts", P("Connection check and repeatable FK-safe import")],
                 ["tests/postgres.test.ts / tests/pg-health.test.ts / tests/postgres-integration.test.ts", P("Translation unit tests, fail-closed health test, 10 PostgreSQL acceptance tests (PGlite)")],
                 ["README.md / .env.example", P("Project docs and env var names")],
                 ["docs/generate-status-report.py", P("Reproducible generator for THIS PDF")]],
                [72 * mm, W - 72 * mm])]

doc = SimpleDocTemplate(
    str(OUT), pagesize=A4,
    leftMargin=18 * mm, rightMargin=18 * mm,
    topMargin=20 * mm, bottomMargin=15 * mm,
    title="Momentum OS - Complete Work & Status Report",
    author="Arena Agent Mode",
    subject="Work completed, known issues and outstanding items",
)
doc.build(story, onFirstPage=first_page, onLaterPages=later_pages)
print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")
