-- Momentum AI — core database schema (PostgreSQL / Supabase)
-- Identity is owned by Supabase Auth (auth.users). Every personal row is keyed by
-- user_id and protected by row level security (see the RLS migration).

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default 'Chisom Ogbonna',
  account_type text not null default 'owner' check (account_type in ('owner', 'team')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null default 'Chisom Ogbonna',
  business_name text not null default '',
  timezone text not null default 'Africa/Lagos',
  work_start text not null default '08:00',
  work_end text not null default '17:00',
  theme text not null default 'light' check (theme in ('light', 'dark', 'system')),
  platforms text not null default 'Instagram,LinkedIn,YouTube,WhatsApp',
  notifications_enabled integer not null default 1,
  auto_plan integer not null default 1,
  daily_templates text not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cycles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null,
  theme text not null default '',
  objective text not null default '',
  objectives text not null default '',
  sales_target integer not null default 0,
  revenue_target double precision not null default 0,
  outreach_target integer not null default 0,
  projects_target integer not null default 0,
  chapter_content_target integer not null default 0,
  course_days text not null default '2,3,5',
  session_day integer not null default 5,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month)
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  price double precision not null default 0,
  description text not null default '',
  active integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_id uuid references public.cycles(id) on delete set null,
  title text not null,
  type text not null default 'Campaign',
  brief text not null default '',
  objective text not null default '',
  deliverables text not null default '',
  stage text not null default 'Brief',
  priority text not null default 'medium',
  start_date text,
  deadline text,
  reference_url text not null default '',
  final_url text not null default '',
  notes text not null default '',
  completed_at text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chapter_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_id uuid references public.cycles(id) on delete set null,
  title text not null,
  central_question text not null default '',
  guest text not null default '',
  session_date text not null,
  session_time text not null default '',
  status text not null default 'Planning',
  youtube_url text not null default '',
  recording_url text not null default '',
  transcript text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_id uuid references public.cycles(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  session_id uuid references public.chapter_sessions(id) on delete set null,
  carried_from_id uuid references public.tasks(id) on delete set null,
  title text not null,
  description text not null default '',
  category text not null default 'Personal',
  priority text not null default 'medium',
  status text not null default 'todo',
  due_date text,
  scheduled_time text not null default '',
  estimated_minutes integer not null default 0,
  actual_minutes integer not null default 0,
  sort_order integer not null default 0,
  notes text not null default '',
  completed_at text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.generated_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  day text not null,
  primary key (user_id, day)
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_id uuid references public.cycles(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  buyer text not null default '',
  amount double precision not null default 0,
  sale_date text not null,
  status text not null default 'pending',
  source text not null default 'Other',
  reference text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_id uuid references public.cycles(id) on delete set null,
  name text not null,
  contact text not null default '',
  source text not null default 'Other',
  status text not null default 'New',
  enquiry_date text,
  follow_up_date text,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_id uuid references public.cycles(id) on delete set null,
  name text not null,
  channel text not null default 'WhatsApp',
  status text not null default 'Planned',
  start_date text,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_id uuid references public.cycles(id) on delete set null,
  promotion_date text not null,
  channel text not null default 'WhatsApp',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prospects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company text not null,
  contact text not null default '',
  website text not null default '',
  industry text not null default '',
  business_type text not null default '',
  opportunity text not null default '',
  status text not null default 'Researching',
  researched_at text,
  follow_up_date text,
  deal_value double precision not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  kind text not null default 'outreach',
  channel text not null default 'Email',
  occurred_date text not null,
  summary text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company text not null,
  role text not null,
  url text not null default '',
  applied_date text,
  follow_up_date text,
  status text not null default 'Interested',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_id uuid references public.cycles(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  session_id uuid references public.chapter_sessions(id) on delete set null,
  title text not null,
  pillar text not null default 'Creative direction',
  platform text not null default 'Instagram',
  format text not null default '',
  status text not null default 'Idea',
  planned_date text,
  published_date text,
  body text not null default '',
  asset_url text not null default '',
  ai_assisted integer not null default 0,
  human_approved integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.session_checklists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.chapter_sessions(id) on delete cascade,
  title text not null,
  done integer not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day text not null,
  wins text not null default '',
  blockers text not null default '',
  lessons text not null default '',
  tomorrow text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, day)
);

create table if not exists public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start text not null,
  wins text not null default '',
  blockers text not null default '',
  lessons text not null default '',
  priorities text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

-- Deliberately separate shared team layer ---------------------------------
create table if not exists public.team_workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null default 'Team Workspace',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.team_workspaces(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'member')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  joined_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.team_workspaces(id) on delete cascade,
  email text not null,
  role text not null check (role in ('manager', 'member')),
  token_hash text not null unique,
  invited_by uuid not null references auth.users(id),
  expires_at bigint not null,
  accepted_at text,
  created_at timestamptz not null default now()
);

create table if not exists public.team_goals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.team_workspaces(id) on delete cascade,
  title text not null,
  description text not null default '',
  target double precision not null default 1,
  current double precision not null default 0,
  unit text not null default 'deliverables',
  due_date text,
  owner_user_id uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.team_workspaces(id) on delete cascade,
  title text not null,
  description text not null default '',
  assignee_user_id uuid not null references auth.users(id),
  goal_id uuid references public.team_goals(id) on delete set null,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  status text not null default 'assigned' check (status in ('assigned', 'in_progress', 'submitted', 'revision_requested', 'approved', 'completed')),
  due_date text,
  deliverable text not null default '',
  submission text not null default '',
  reviewer_user_id uuid references auth.users(id) on delete set null,
  feedback text not null default '',
  submitted_at text,
  reviewed_at text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.team_tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.team_activity (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.team_workspaces(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  summary text not null,
  created_at timestamptz not null default now()
);

-- Momentum AI layer -------------------------------------------------------
create table if not exists public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  model text not null default 'rules-v1',
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  status text not null default 'completed',
  created_at timestamptz not null default now()
);

create table if not exists public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dedupe_key text not null,
  category text not null default 'General',
  title text not null,
  body text not null default '',
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  confidence numeric(4, 3) not null default 0.5,
  source text not null default 'rules-v1',
  related_entity_type text,
  related_entity_id uuid,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create table if not exists public.ai_daily_briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day text not null,
  content jsonb not null default '{}'::jsonb,
  approved integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, day)
);

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  summary text not null default '',
  created_at timestamptz not null default now()
);

-- Indexes -----------------------------------------------------------------
create index if not exists idx_tasks_user_due on public.tasks (user_id, due_date);
create index if not exists idx_tasks_user_status on public.tasks (user_id, status);
create index if not exists idx_sales_user_cycle on public.sales (user_id, cycle_id, status);
create index if not exists idx_interactions_user_date on public.interactions (user_id, occurred_date);
create index if not exists idx_content_user_date on public.content_items (user_id, planned_date);
create index if not exists idx_sessions_user_date on public.chapter_sessions (user_id, session_date);
create index if not exists idx_team_tasks_workspace_due on public.team_tasks (workspace_id, due_date);
create index if not exists idx_team_tasks_assignee on public.team_tasks (assignee_user_id, status);
create index if not exists idx_team_activity_workspace on public.team_activity (workspace_id, created_at);
create index if not exists idx_team_invites_email on public.team_invites (email, expires_at);
create index if not exists idx_ai_suggestions_inbox on public.ai_suggestions (user_id, status, created_at desc);
create index if not exists idx_activity_events_user on public.activity_events (user_id, created_at desc);

-- updated_at ---------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','settings','cycles','products','projects','chapter_sessions','tasks',
    'sales','leads','campaigns','promotions','prospects','interactions','jobs',
    'content_items','session_checklists','daily_notes','weekly_reviews',
    'team_workspaces','team_goals','team_tasks','ai_suggestions','ai_daily_briefs'
  ] loop
    execute format('drop trigger if exists trg_%s_updated_at on public.%I', t, t);
    execute format('create trigger trg_%s_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end;
$$;

-- New Auth accounts get an isolated workspace with editable defaults.
-- Team accounts (created through an invitation) receive no personal data.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_type text;
  v_name text;
  v_stamp timestamptz := now();
  v_ws uuid;
  v_templates text := $tpl$[
    {"title":"Publish today's Graphic Design with AI course promotion on WhatsApp Status","category":"Course Growth","priority":"high","estimated_minutes":20},
    {"title":"Respond to course enquiries and follow up warm leads","category":"Course Growth","priority":"high","estimated_minutes":30},
    {"title":"Complete and log 20 targeted client outreach actions","category":"Client Pipeline","priority":"high","estimated_minutes":75},
    {"title":"Review the 5 AM batch: 10 job listings and 10 trigger-based outreach targets","category":"Client Pipeline","priority":"high","estimated_minutes":25,"scheduled_time":"05:00"},
    {"title":"Review the 6 AM LinkedIn batch: 10 roles and 10 founders or product owners","category":"Client Pipeline","priority":"high","estimated_minutes":25,"scheduled_time":"06:00"},
    {"title":"Review the 8 AM batch: 10 fresh job listings and 10 trigger-based outreach targets","category":"Client Pipeline","priority":"high","estimated_minutes":25,"scheduled_time":"08:00"},
    {"title":"Capture one useful idea or lesson for your personal brand","category":"Personal Brand","priority":"medium","estimated_minutes":15},
    {"title":"Record today's wins, blockers and tomorrow's first action","category":"Personal","priority":"low","estimated_minutes":10}
  ]$tpl$;
begin
  v_type := coalesce(new.raw_user_meta_data ->> 'account_type', 'owner');
  if v_type not in ('owner', 'team') then v_type := 'owner'; end if;
  v_name := coalesce(new.raw_user_meta_data ->> 'name', 'Chisom Ogbonna');

  insert into public.profiles (id, email, name, account_type, created_at, updated_at)
  values (new.id, coalesce(new.email, ''), v_name, v_type, v_stamp, v_stamp)
  on conflict (id) do nothing;

  if v_type = 'owner' then
    insert into public.settings (user_id, name, timezone, work_start, work_end, theme, auto_plan, daily_templates, created_at, updated_at)
    values (new.id, v_name, 'Africa/Lagos', '08:00', '17:00', 'light', 1, v_templates, v_stamp, v_stamp)
    on conflict (user_id) do nothing;

    insert into public.products (user_id, name, price, description, active, created_at, updated_at)
    values (new.id, 'Graphic Design with AI', 14900, 'Digital course', 1, v_stamp, v_stamp);

    insert into public.cycles (
      user_id, month, theme, objective, objectives, sales_target, revenue_target,
      outreach_target, projects_target, chapter_content_target, course_days,
      session_day, status, created_at, updated_at
    ) values (
      new.id, to_char(v_stamp at time zone 'Africa/Lagos', 'YYYY-MM'),
      'Build with intention',
      'Sell 68 seats of Graphic Design with AI while building a consistent creative and client pipeline.',
      E'Sell 68 seats of Graphic Design with AI\nHost a Next Chapter conversation every Friday\nComplete two substantial creative projects each week\nPublish course-related content on Tuesday, Wednesday, and Friday\nProduce two substantial Next Chapter content pieces weekly\nComplete 20 client outreach actions daily\nDevelop a consistent personal brand across platforms\nUse weekends for content development and weekly preparation',
      68, 1013200, 20, 2, 2, '2,3,5', 5, 'active', v_stamp, v_stamp
    ) on conflict (user_id, month) do nothing;

    insert into public.team_workspaces (owner_user_id, name, created_at, updated_at)
    values (new.id, 'Team Workspace', v_stamp, v_stamp)
    on conflict (owner_user_id) do nothing;

    select id into v_ws from public.team_workspaces where owner_user_id = new.id;
    insert into public.team_members (workspace_id, user_id, role, status, joined_at)
    values (v_ws, new.id, 'owner', 'active', v_stamp)
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$fn$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
