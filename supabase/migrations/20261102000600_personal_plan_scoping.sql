-- Momentum OS — personal-plan scoping and clean multi-user defaults.
-- Additive: replaces two seed/generator FUNCTIONS and adds columns/tables only.
-- No DROP / TRUNCATE / DELETE of user data.
-- Chisom's November plan lives in server/personalPlan.ts and is applied only
-- to the verified personal owner; it is never a default for new accounts.

create table if not exists momentum_os.personal_plan_owner (
  user_id text PRIMARY KEY REFERENCES momentum_os.users(id) ON DELETE CASCADE,
  marked_at text NOT NULL
);

alter table momentum_os.speakers
  add column if not exists reminder_status text NOT NULL DEFAULT 'not_sent';
alter table momentum_os.speakers
  add column if not exists asset_approval_status text NOT NULL DEFAULT 'pending';

-- New Supabase Auth accounts get a clean, isolated workspace.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  v_type text := coalesce(new.raw_user_meta_data ->> 'account_type', 'owner');
  v_name text := coalesce(nullif(new.raw_user_meta_data ->> 'name',''), 'My Workspace');
  v_stamp timestamptz := now();
  v_ws uuid;
begin
  if v_type not in ('owner','team') then v_type := 'owner'; end if;
  insert into public.profiles (id,email,name,account_type,created_at,updated_at)
  values (new.id, coalesce(new.email,''), v_name, v_type, v_stamp, v_stamp)
  on conflict (id) do nothing;

  if v_type = 'owner' then
    insert into public.settings (user_id,name,timezone,work_start,work_end,theme,auto_plan,daily_templates,created_at,updated_at)
    values (new.id,v_name,'Africa/Lagos','08:00','17:00','light',0,'[]',v_stamp,v_stamp)
    on conflict (user_id) do nothing;

    insert into public.cycles
      (user_id,month,theme,objective,objectives,sales_target,revenue_target,outreach_target,projects_target,chapter_content_target,course_days,session_day,status,created_at,updated_at)
    values
      (new.id,to_char(v_stamp at time zone 'Africa/Lagos','YYYY-MM'),'My month',
       'Set your own goals for this month.','',0,0,0,0,0,'',5,'active',v_stamp,v_stamp)
    on conflict (user_id,month) do nothing;

    insert into public.team_workspaces (owner_user_id,name,created_at,updated_at)
    values (new.id,'Team Workspace',v_stamp,v_stamp) on conflict (owner_user_id) do nothing;
    select id into v_ws from public.team_workspaces where owner_user_id = new.id;
    insert into public.team_members (workspace_id,user_id,role,status,joined_at)
    values (v_ws,new.id,'owner','active',v_stamp) on conflict (user_id) do nothing;
  end if;
  return new;
end;
$fn$;

-- Daily planning uses ONLY the account owner's own editable templates.
create or replace function public.ensure_daily_plan(p_reference_date date default null)
returns integer language plpgsql security definer set search_path = public as $fn$
declare
  v_uid uuid := auth.uid();
  v_settings public.settings%rowtype;
  v_day date;
  v_cycle uuid;
  v_templates jsonb := '[]'::jsonb;
  v_item jsonb;
  v_ord integer;
  v_stamp timestamptz := now();
  v_count integer := 0;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into v_settings from public.settings where user_id = v_uid;
  if not found then return 0; end if;
  v_day := coalesce(p_reference_date,(now() at time zone coalesce(nullif(v_settings.timezone,''),'Africa/Lagos'))::date);
  select id into v_cycle from public.cycles where user_id = v_uid and month = to_char(v_day,'YYYY-MM') limit 1;
  if coalesce(v_settings.auto_plan,0) <> 1 then return 0; end if;
  begin
    v_templates := coalesce(v_settings.daily_templates::jsonb,'[]'::jsonb);
  exception when others then v_templates := '[]'::jsonb;
  end;
  if jsonb_typeof(v_templates) <> 'array' then v_templates := '[]'::jsonb; end if;
  if exists (select 1 from public.generated_days where user_id = v_uid and day = to_char(v_day,'YYYY-MM-DD')) then return 0; end if;
  insert into public.generated_days (user_id,day) values (v_uid,to_char(v_day,'YYYY-MM-DD')) on conflict do nothing;
  for v_item, v_ord in select value, ord::integer from jsonb_array_elements(v_templates) with ordinality as t(value,ord)
  loop
    if v_ord > 30 then exit; end if;
    if coalesce(v_item ->> 'title','') = '' then continue; end if;
    insert into public.tasks
      (user_id,cycle_id,title,category,priority,status,due_date,scheduled_time,estimated_minutes,sort_order,created_at,updated_at)
    values
      (v_uid,v_cycle,left(v_item ->> 'title',200),left(coalesce(v_item ->> 'category','Personal'),80),
       case when v_item ->> 'priority' in ('high','medium','low') then v_item ->> 'priority' else 'medium' end,
       'todo',to_char(v_day,'YYYY-MM-DD'),coalesce(v_item ->> 'scheduled_time',''),
       least(coalesce((v_item ->> 'estimated_minutes')::integer,0),1440),v_ord,v_stamp,v_stamp);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$fn$;

-- Rollback notes: restore previous function bodies from migrations
-- 20261102000100 / 20261102000300. No data is removed here.
