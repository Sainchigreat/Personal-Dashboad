-- Momentum OS — additive goal hierarchy (Monthly -> Weekly -> Daily).
-- Version: 20261102000500. Safe to re-run: every object uses IF NOT EXISTS and
-- no existing table, column or row is dropped, truncated, renamed or rewritten.
--
-- Rollback notes (only with explicit approval, never as part of a deploy):
--   alter table momentum_os.tasks drop column if exists weekly_goal_id;
--   drop table if exists momentum_os.goal_links;
--   drop table if exists momentum_os.weekly_goals;
--   drop table if exists momentum_os.monthly_goals;
-- Dropping these would remove goal links but never sales, tasks, projects,
-- sessions, accounts or preferences.

create schema if not exists momentum_os;

create table if not exists momentum_os.monthly_goals (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES momentum_os.users(id) ON DELETE CASCADE,
  workspace_id text NOT NULL DEFAULT 'personal',
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  metric_type text NOT NULL DEFAULT 'outcome',
  source text NOT NULL DEFAULT 'manual',
  target double precision NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT '',
  baseline double precision NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  start_date text,
  end_date text,
  notes text NOT NULL DEFAULT '',
  created_at text NOT NULL,
  updated_at text NOT NULL
);

create table if not exists momentum_os.weekly_goals (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES momentum_os.users(id) ON DELETE CASCADE,
  workspace_id text NOT NULL DEFAULT 'personal',
  monthly_goal_id text REFERENCES momentum_os.monthly_goals(id) ON DELETE SET NULL,
  cycle_id text REFERENCES momentum_os.cycles(id) ON DELETE SET NULL,
  week_start text NOT NULL,
  week_end text NOT NULL,
  outcome text NOT NULL,
  target double precision NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT '',
  current double precision NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'manual',
  owner_id text REFERENCES momentum_os.users(id) ON DELETE SET NULL,
  assignee_id text REFERENCES momentum_os.users(id) ON DELETE SET NULL,
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'active',
  visibility text NOT NULL DEFAULT 'private',
  notes text NOT NULL DEFAULT '',
  created_at text NOT NULL,
  updated_at text NOT NULL
);

-- A weekly goal may support more than one monthly goal.
create table if not exists momentum_os.goal_links (
  user_id text NOT NULL REFERENCES momentum_os.users(id) ON DELETE CASCADE,
  weekly_goal_id text NOT NULL REFERENCES momentum_os.weekly_goals(id) ON DELETE CASCADE,
  monthly_goal_id text NOT NULL REFERENCES momentum_os.monthly_goals(id) ON DELETE CASCADE,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  PRIMARY KEY (weekly_goal_id, monthly_goal_id)
);

-- Daily deliverables link to a weekly goal; the column is optional so ad hoc
-- work and all existing task history remain untouched.
alter table momentum_os.tasks
  add column if not exists weekly_goal_id text
  REFERENCES momentum_os.weekly_goals(id) ON DELETE SET NULL;

create index if not exists idx_monthly_goals_user_status on momentum_os.monthly_goals(user_id,status);
create index if not exists idx_monthly_goals_workspace on momentum_os.monthly_goals(workspace_id,user_id);
create index if not exists idx_monthly_goals_dates on momentum_os.monthly_goals(start_date,end_date);
create index if not exists idx_weekly_goals_parent on momentum_os.weekly_goals(monthly_goal_id,status);
create index if not exists idx_weekly_goals_week on momentum_os.weekly_goals(user_id,week_start,week_end);
create index if not exists idx_weekly_goals_assignee on momentum_os.weekly_goals(assignee_id,status);
create index if not exists idx_goal_links_monthly on momentum_os.goal_links(monthly_goal_id);
create index if not exists idx_goal_links_user on momentum_os.goal_links(user_id);
create index if not exists idx_tasks_weekly_goal on momentum_os.tasks(weekly_goal_id,status);

-- Prevent duplicate weekly goals for the same owner/week/outcome on backfill.
create unique index if not exists uq_weekly_goals_owner_week_outcome
  on momentum_os.weekly_goals(user_id,week_start,outcome);
create unique index if not exists uq_monthly_goals_owner_title_period
  on momentum_os.monthly_goals(user_id,title,coalesce(start_date,''));

-- Onboarding state (additive, safe defaults, no existing preference changed).
alter table momentum_os.settings
  add column if not exists onboarding_completed integer NOT NULL DEFAULT 0;
alter table momentum_os.settings
  add column if not exists onboarding_profile text NOT NULL DEFAULT '{}';

-- Next Chapter speaker register (additive). Kept separate from the course
-- promotional-partner workflow in the daily routine.
create table if not exists momentum_os.speakers (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES momentum_os.users(id) ON DELETE CASCADE,
  workspace_id text NOT NULL DEFAULT 'personal',
  session_id text REFERENCES momentum_os.chapter_sessions(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  organisation text NOT NULL DEFAULT '',
  biography text NOT NULL DEFAULT '',
  topic text NOT NULL DEFAULT '',
  invitation_status text NOT NULL DEFAULT 'not_invited',
  confirmation_status text NOT NULL DEFAULT 'pending',
  agreed_date text,
  alternative_dates text NOT NULL DEFAULT '',
  reminder_dates text NOT NULL DEFAULT '',
  asset_requirements text NOT NULL DEFAULT '',
  bio_photo_received integer NOT NULL DEFAULT 0,
  flyer_approved integer NOT NULL DEFAULT 0,
  owner_id text REFERENCES momentum_os.users(id) ON DELETE SET NULL,
  notes text NOT NULL DEFAULT '',
  created_at text NOT NULL,
  updated_at text NOT NULL
);
create table if not exists momentum_os.speaker_followups (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES momentum_os.users(id) ON DELETE CASCADE,
  speaker_id text NOT NULL REFERENCES momentum_os.speakers(id) ON DELETE CASCADE,
  occurred_date text NOT NULL,
  channel text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  created_at text NOT NULL,
  updated_at text NOT NULL
);
create index if not exists idx_speakers_user_status on momentum_os.speakers(user_id,invitation_status);
create index if not exists idx_speakers_session on momentum_os.speakers(session_id);
create index if not exists idx_speakers_owner on momentum_os.speakers(owner_id);
create index if not exists idx_speaker_followups_speaker on momentum_os.speaker_followups(speaker_id,occurred_date);
