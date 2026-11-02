-- Momentum OS — additive PostgreSQL translation of server/schema.sql.
-- Reconciles with the EXISTING public schema (Supabase Auth / RLS / uuid) without
-- dropping, truncating, renaming or overwriting any existing table or row.
-- The Express API keeps its custom bcrypt/cookie/CSRF authentication and its exact
-- table names, TEXT UUID ids, columns, foreign keys, uniqueness, indexes and
-- cascade / set-null behaviour in a dedicated schema.
-- Server connections set: search_path = momentum_os, public

create schema if not exists momentum_os;


create table if not exists momentum_os.app_migrations (
  name text PRIMARY KEY,
  applied_at text NOT NULL
);

create table if not exists momentum_os.users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  account_type text NOT NULL DEFAULT 'owner' CHECK(account_type IN ('owner','team')),
  created_at text NOT NULL
);

create table if not exists momentum_os.auth_sessions (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL references momentum_os.users(id) ON DELETE CASCADE,
  csrf_token text NOT NULL,
  expires_at bigint NOT NULL
);

create table if not exists momentum_os.settings (
  id text PRIMARY KEY,
  user_id text NOT NULL UNIQUE references momentum_os.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Chisom Ogbonna',
  business_name text NOT NULL DEFAULT '',
  timezone text NOT NULL DEFAULT 'Africa/Lagos',
  work_start text NOT NULL DEFAULT '08:00',
  work_end text NOT NULL DEFAULT '17:00',
  theme text NOT NULL DEFAULT 'light',
  platforms text NOT NULL DEFAULT 'Instagram,LinkedIn,YouTube,WhatsApp',
  notifications_enabled integer NOT NULL DEFAULT 1,
  auto_plan integer NOT NULL DEFAULT 1,
  daily_templates text NOT NULL DEFAULT '[]',
  created_at text NOT NULL,
  updated_at text NOT NULL
);

create table if not exists momentum_os.cycles (
  id text PRIMARY KEY,
  user_id text NOT NULL references momentum_os.users(id) ON DELETE CASCADE,
  month text NOT NULL,
  theme text NOT NULL DEFAULT '',
  objective text NOT NULL DEFAULT '',
  objectives text NOT NULL DEFAULT '',
  sales_target integer NOT NULL DEFAULT 0,
  revenue_target double precision NOT NULL DEFAULT 0,
  outreach_target integer NOT NULL DEFAULT 0,
  projects_target integer NOT NULL DEFAULT 0,
  chapter_content_target integer NOT NULL DEFAULT 0,
  course_days text NOT NULL DEFAULT '2,3,5',
  session_day integer NOT NULL DEFAULT 5,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  created_at text NOT NULL,
  updated_at text NOT NULL,
  UNIQUE(user_id, month)
);

create table if not exists momentum_os.products (
  id text PRIMARY KEY,
  user_id text NOT NULL references momentum_os.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  price double precision NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  active integer NOT NULL DEFAULT 1,
  created_at text NOT NULL,
  updated_at text NOT NULL
);

create table if not exists momentum_os.projects (
  id text PRIMARY KEY,
  user_id text NOT NULL references momentum_os.users(id) ON DELETE CASCADE,
  cycle_id text references momentum_os.cycles(id) ON DELETE SET NULL,
  title text NOT NULL,
  type text NOT NULL DEFAULT 'Campaign',
  brief text NOT NULL DEFAULT '',
  objective text NOT NULL DEFAULT '',
  deliverables text NOT NULL DEFAULT '',
  stage text NOT NULL DEFAULT 'Brief',
  priority text NOT NULL DEFAULT 'medium',
  start_date text,
  deadline text,
  reference_url text NOT NULL DEFAULT '',
  final_url text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  completed_at text,
  created_at text NOT NULL,
  updated_at text NOT NULL
);

create table if not exists momentum_os.chapter_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL references momentum_os.users(id) ON DELETE CASCADE,
  cycle_id text references momentum_os.cycles(id) ON DELETE SET NULL,
  title text NOT NULL,
  central_question text NOT NULL DEFAULT '',
  guest text NOT NULL DEFAULT '',
  session_date text NOT NULL,
  session_time text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Planning',
  youtube_url text NOT NULL DEFAULT '',
  recording_url text NOT NULL DEFAULT '',
  transcript text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at text NOT NULL,
  updated_at text NOT NULL
);

create table if not exists momentum_os.tasks (
  id text PRIMARY KEY,
  user_id text NOT NULL references momentum_os.users(id) ON DELETE CASCADE,
  cycle_id text references momentum_os.cycles(id) ON DELETE SET NULL,
  project_id text references momentum_os.projects(id) ON DELETE SET NULL,
  session_id text references momentum_os.chapter_sessions(id) ON DELETE SET NULL,
  carried_from_id text references momentum_os.tasks(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'Personal',
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'todo',
  due_date text,
  scheduled_time text NOT NULL DEFAULT '',
  estimated_minutes integer NOT NULL DEFAULT 0,
  actual_minutes integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  completed_at text,
  created_at text NOT NULL,
  updated_at text NOT NULL
);

create table if not exists momentum_os.generated_days (
  user_id text NOT NULL references momentum_os.users(id) ON DELETE CASCADE,
  day text NOT NULL,
  PRIMARY KEY(user_id, day)
);

create table if not exists momentum_os.sales (
  id text PRIMARY KEY,
  user_id text NOT NULL references momentum_os.users(id) ON DELETE CASCADE,
  cycle_id text references momentum_os.cycles(id) ON DELETE SET NULL,
  product_id text references momentum_os.products(id) ON DELETE SET NULL,
  buyer text NOT NULL DEFAULT '',
  amount double precision NOT NULL DEFAULT 0,
  sale_date text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  source text NOT NULL DEFAULT 'Other',
  reference text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at text NOT NULL,
  updated_at text NOT NULL
);

create table if not exists momentum_os.leads (
  id text PRIMARY KEY,
  user_id text NOT NULL references momentum_os.users(id) ON DELETE CASCADE,
  cycle_id text references momentum_os.cycles(id) ON DELETE SET NULL,
  name text NOT NULL,
  contact text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'Other',
  status text NOT NULL DEFAULT 'New',
  enquiry_date text,
  follow_up_date text,
  notes text NOT NULL DEFAULT '',
  created_at text NOT NULL,
  updated_at text NOT NULL
);

create table if not exists momentum_os.campaigns (
  id text PRIMARY KEY,
  user_id text NOT NULL references momentum_os.users(id) ON DELETE CASCADE,
  cycle_id text references momentum_os.cycles(id) ON DELETE SET NULL,
  name text NOT NULL,
  channel text NOT NULL DEFAULT 'WhatsApp',
  status text NOT NULL DEFAULT 'Planned',
  start_date text,
  notes text NOT NULL DEFAULT '',
  created_at text NOT NULL,
  updated_at text NOT NULL
);

create table if not exists momentum_os.promotions (
  id text PRIMARY KEY,
  user_id text NOT NULL references momentum_os.users(id) ON DELETE CASCADE,
  cycle_id text references momentum_os.cycles(id) ON DELETE SET NULL,
  promotion_date text NOT NULL,
  channel text NOT NULL DEFAULT 'WhatsApp',
  notes text NOT NULL DEFAULT '',
  created_at text NOT NULL,
  updated_at text NOT NULL
);

create table if not exists momentum_os.prospects (
  id text PRIMARY KEY,
  user_id text NOT NULL references momentum_os.users(id) ON DELETE CASCADE,
  company text NOT NULL,
  contact text NOT NULL DEFAULT '',
  website text NOT NULL DEFAULT '',
  industry text NOT NULL DEFAULT '',
  business_type text NOT NULL DEFAULT '',
  opportunity text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Researching',
  researched_at text,
  follow_up_date text,
  deal_value double precision NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  created_at text NOT NULL,
  updated_at text NOT NULL
);

create table if not exists momentum_os.interactions (
  id text PRIMARY KEY,
  user_id text NOT NULL references momentum_os.users(id) ON DELETE CASCADE,
  prospect_id text NOT NULL references momentum_os.prospects(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'outreach',
  channel text NOT NULL DEFAULT 'Email',
  occurred_date text NOT NULL,
  summary text NOT NULL DEFAULT '',
  created_at text NOT NULL,
  updated_at text NOT NULL
);

create table if not exists momentum_os.jobs (
  id text PRIMARY KEY,
  user_id text NOT NULL references momentum_os.users(id) ON DELETE CASCADE,
  company text NOT NULL,
  role text NOT NULL,
  url text NOT NULL DEFAULT '',
  applied_date text,
  follow_up_date text,
  status text NOT NULL DEFAULT 'Interested',
  notes text NOT NULL DEFAULT '',
  created_at text NOT NULL,
  updated_at text NOT NULL
);

create table if not exists momentum_os.content_items (
  id text PRIMARY KEY,
  user_id text NOT NULL references momentum_os.users(id) ON DELETE CASCADE,
  cycle_id text references momentum_os.cycles(id) ON DELETE SET NULL,
  project_id text references momentum_os.projects(id) ON DELETE SET NULL,
  session_id text references momentum_os.chapter_sessions(id) ON DELETE SET NULL,
  title text NOT NULL,
  pillar text NOT NULL DEFAULT 'Creative direction',
  platform text NOT NULL DEFAULT 'Instagram',
  format text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Idea',
  planned_date text,
  published_date text,
  body text NOT NULL DEFAULT '',
  asset_url text NOT NULL DEFAULT '',
  ai_assisted integer NOT NULL DEFAULT 0,
  human_approved integer NOT NULL DEFAULT 0,
  created_at text NOT NULL,
  updated_at text NOT NULL
);

create table if not exists momentum_os.session_checklists (
  id text PRIMARY KEY,
  user_id text NOT NULL references momentum_os.users(id) ON DELETE CASCADE,
  session_id text NOT NULL references momentum_os.chapter_sessions(id) ON DELETE CASCADE,
  title text NOT NULL,
  done integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at text NOT NULL,
  updated_at text NOT NULL
);

create table if not exists momentum_os.daily_notes (
  id text PRIMARY KEY,
  user_id text NOT NULL references momentum_os.users(id) ON DELETE CASCADE,
  day text NOT NULL,
  wins text NOT NULL DEFAULT '',
  blockers text NOT NULL DEFAULT '',
  lessons text NOT NULL DEFAULT '',
  tomorrow text NOT NULL DEFAULT '',
  created_at text NOT NULL,
  updated_at text NOT NULL,
  UNIQUE(user_id, day)
);

create table if not exists momentum_os.weekly_reviews (
  id text PRIMARY KEY,
  user_id text NOT NULL references momentum_os.users(id) ON DELETE CASCADE,
  week_start text NOT NULL,
  wins text NOT NULL DEFAULT '',
  blockers text NOT NULL DEFAULT '',
  lessons text NOT NULL DEFAULT '',
  priorities text NOT NULL DEFAULT '',
  created_at text NOT NULL,
  updated_at text NOT NULL,
  UNIQUE(user_id, week_start)
);

create index if not exists idx_tasks_user_due on momentum_os.tasks (user_id, due_date);

create index if not exists idx_sales_user_cycle on momentum_os.sales (user_id, cycle_id, status);

create index if not exists idx_interactions_user_date on momentum_os.interactions (user_id, occurred_date);

create index if not exists idx_content_user_date on momentum_os.content_items (user_id, planned_date);

create index if not exists idx_sessions_user_date on momentum_os.chapter_sessions (user_id, session_date);

create table if not exists momentum_os.team_workspaces (
  id text PRIMARY KEY,
  owner_user_id text NOT NULL UNIQUE references momentum_os.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Team Workspace',
  created_at text NOT NULL,
  updated_at text NOT NULL
);

create table if not exists momentum_os.team_members (
  id text PRIMARY KEY,
  workspace_id text NOT NULL references momentum_os.team_workspaces(id) ON DELETE CASCADE,
  user_id text NOT NULL UNIQUE references momentum_os.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK(role IN ('owner','manager','member')),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
  joined_at text NOT NULL,
  UNIQUE(workspace_id,user_id)
);

create table if not exists momentum_os.team_invites (
  id text PRIMARY KEY,
  workspace_id text NOT NULL references momentum_os.team_workspaces(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK(role IN ('manager','member')),
  token_hash text NOT NULL UNIQUE,
  invited_by text NOT NULL references momentum_os.users(id),
  expires_at bigint NOT NULL,
  accepted_at text,
  created_at text NOT NULL
);

create table if not exists momentum_os.team_goals (
  id text PRIMARY KEY,
  workspace_id text NOT NULL references momentum_os.team_workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  target double precision NOT NULL DEFAULT 1,
  current double precision NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'deliverables',
  due_date text,
  owner_user_id text references momentum_os.users(id) ON DELETE SET NULL,
  created_by text NOT NULL references momentum_os.users(id),
  created_at text NOT NULL,
  updated_at text NOT NULL
);

create table if not exists momentum_os.team_tasks (
  id text PRIMARY KEY,
  workspace_id text NOT NULL references momentum_os.team_workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  assignee_user_id text NOT NULL references momentum_os.users(id),
  goal_id text references momentum_os.team_goals(id) ON DELETE SET NULL,
  priority text NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high')),
  status text NOT NULL DEFAULT 'assigned' CHECK(status IN ('assigned','in_progress','submitted','revision_requested','approved','completed')),
  due_date text,
  deliverable text NOT NULL DEFAULT '',
  submission text NOT NULL DEFAULT '',
  reviewer_user_id text references momentum_os.users(id) ON DELETE SET NULL,
  feedback text NOT NULL DEFAULT '',
  submitted_at text,
  reviewed_at text,
  created_by text NOT NULL references momentum_os.users(id),
  created_at text NOT NULL,
  updated_at text NOT NULL
);

create table if not exists momentum_os.team_comments (
  id text PRIMARY KEY,
  task_id text NOT NULL references momentum_os.team_tasks(id) ON DELETE CASCADE,
  user_id text NOT NULL references momentum_os.users(id),
  body text NOT NULL,
  created_at text NOT NULL
);

create table if not exists momentum_os.team_activity (
  id text PRIMARY KEY,
  workspace_id text NOT NULL references momentum_os.team_workspaces(id) ON DELETE CASCADE,
  actor_user_id text NOT NULL references momentum_os.users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  summary text NOT NULL,
  created_at text NOT NULL
);

create index if not exists idx_team_tasks_workspace_due on momentum_os.team_tasks (workspace_id,due_date);

create index if not exists idx_team_tasks_assignee on momentum_os.team_tasks (assignee_user_id,status);

create index if not exists idx_team_activity_workspace on momentum_os.team_activity (workspace_id,created_at);

create index if not exists idx_team_invites_email on momentum_os.team_invites (email,expires_at);


-- Evidence table for the live connection / persistence round trip.
-- Additive metadata only; holds no personal records.
create table if not exists momentum_os.integration_checks (
  id text primary key,
  label text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on schema momentum_os is
  'Exact PostgreSQL translation of server/schema.sql for the Express/Netlify API. Coexists with public (Supabase Auth + RLS); no existing table was altered.';
