-- Momentum AI — database API: RPCs, reporting views and an audit trail.
-- All user-facing functions resolve the caller with auth.uid(); nobody can
-- pass another user's id. The AI layer is deterministic and rules-based until
-- an external model is connected: it never invents completed work or sales.

create or replace function public.momentum_health()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'product', 'Momentum AI',
    'status', 'ok',
    'database', 'PostgreSQL ' || current_setting('server_version'),
    'tables', (select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'),
    'rls_enabled_tables', (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity),
    'policies', (select count(*) from pg_policies where schemaname = 'public'),
    'rpc_functions', (select count(*) from information_schema.routines where routine_schema = 'public' and routine_type = 'FUNCTION'),
    'checked_at', now()
  );
$$;

create or replace function public.command_centre(p_month text default null)
returns jsonb language plpgsql stable security invoker set search_path = public as $fn$
declare
  v_uid uuid := auth.uid();
  v_month text;
  v_sales_target integer := 0;
  v_revenue_target double precision := 0;
  v_outreach_target integer := 0;
  v_paid bigint := 0;
  v_revenue numeric := 0;
  v_outreach bigint := 0;
  v_open bigint := 0;
  v_done bigint := 0;
  v_projects bigint := 0;
  v_published bigint := 0;
  v_next_session text;
begin
  v_month := coalesce(p_month, to_char(now() at time zone 'Africa/Lagos', 'YYYY-MM'));
  select coalesce(max(sales_target),0), coalesce(max(revenue_target),0), coalesce(max(outreach_target),0)
    into v_sales_target, v_revenue_target, v_outreach_target
    from public.cycles where user_id = v_uid and month = v_month;
  select count(*), coalesce(sum(amount),0) into v_paid, v_revenue
    from public.sales where user_id = v_uid and status = 'paid' and amount > 0 and sale_date like v_month || '%';
  select count(*) into v_outreach
    from public.interactions where user_id = v_uid and kind = 'outreach' and occurred_date like v_month || '%';
  select count(*) into v_open from public.tasks where user_id = v_uid and status in ('todo','in_progress');
  select count(*) into v_done from public.tasks where user_id = v_uid and status = 'done';
  select count(*) into v_projects from public.projects where user_id = v_uid and stage = 'Completed';
  select count(*) into v_published from public.content_items where user_id = v_uid and status = 'Published';
  select min(session_date) into v_next_session
    from public.chapter_sessions
    where user_id = v_uid and session_date >= to_char(now() at time zone 'Africa/Lagos','YYYY-MM-DD')
      and status not in ('Archived','Completed');
  return jsonb_build_object(
    'month', v_month,
    'sales_target', v_sales_target,
    'revenue_target', v_revenue_target,
    'outreach_target', v_outreach_target,
    'paid_sales', v_paid,
    'realised_revenue', v_revenue,
    'outreach_actions', v_outreach,
    'open_tasks', v_open,
    'completed_tasks', v_done,
    'completed_projects', v_projects,
    'published_content', v_published,
    'next_session_date', v_next_session,
    'generated_at', now()
  );
end;
$fn$;

create or replace function public.workspace_bootstrap()
returns jsonb language sql stable security invoker set search_path = public as $fn$
  select jsonb_build_object(
    'settings', (select to_jsonb(s) from public.settings s where s.user_id = auth.uid()),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'cycles', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.cycles t where t.user_id = auth.uid()), '[]'::jsonb),
    'products', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.products t where t.user_id = auth.uid()), '[]'::jsonb),
    'projects', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.projects t where t.user_id = auth.uid()), '[]'::jsonb),
    'chapter_sessions', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.chapter_sessions t where t.user_id = auth.uid()), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.tasks t where t.user_id = auth.uid()), '[]'::jsonb),
    'sales', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.sales t where t.user_id = auth.uid()), '[]'::jsonb),
    'leads', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.leads t where t.user_id = auth.uid()), '[]'::jsonb),
    'campaigns', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.campaigns t where t.user_id = auth.uid()), '[]'::jsonb),
    'promotions', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.promotions t where t.user_id = auth.uid()), '[]'::jsonb),
    'prospects', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.prospects t where t.user_id = auth.uid()), '[]'::jsonb),
    'interactions', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.interactions t where t.user_id = auth.uid()), '[]'::jsonb),
    'jobs', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.jobs t where t.user_id = auth.uid()), '[]'::jsonb),
    'content_items', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.content_items t where t.user_id = auth.uid()), '[]'::jsonb),
    'session_checklists', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.session_checklists t where t.user_id = auth.uid()), '[]'::jsonb),
    'daily_notes', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.daily_notes t where t.user_id = auth.uid()), '[]'::jsonb),
    'weekly_reviews', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.weekly_reviews t where t.user_id = auth.uid()), '[]'::jsonb),
    'ai_suggestions', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.ai_suggestions t where t.user_id = auth.uid()), '[]'::jsonb),
    'ai_daily_briefs', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.ai_daily_briefs t where t.user_id = auth.uid()), '[]'::jsonb)
  );
$fn$;

-- Generate editable daily plans once per local day; never fabricate outcomes.
create or replace function public.ensure_daily_plan(p_reference_date date default null)
returns integer language plpgsql security definer set search_path = public as $fn$
declare
  v_uid uuid := auth.uid();
  v_settings public.settings%rowtype;
  v_day date;
  v_cycle uuid;
  v_templates jsonb := '[]'::jsonb;
  v_plans jsonb := '[]'::jsonb;
  v_item jsonb;
  v_ord integer;
  v_dow integer;
  v_stamp timestamptz := now();
  v_count integer := 0;
  v_title text;
  v_session record;
  v_est text;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into v_settings from public.settings where user_id = v_uid;
  if not found then return 0; end if;
  v_day := coalesce(p_reference_date, (now() at time zone coalesce(nullif(v_settings.timezone,''),'Africa/Lagos'))::date);
  select id into v_cycle from public.cycles where user_id = v_uid and month = to_char(v_day,'YYYY-MM') limit 1;

  -- Seven-day-ahead guest confirmation, independent of the recurring plan.
  for v_session in
    select id, title, guest from public.chapter_sessions
    where user_id = v_uid and session_date = to_char(v_day + 7, 'YYYY-MM-DD')
      and status not in ('Archived','Completed')
  loop
    v_title := case when coalesce(v_session.guest,'') <> ''
      then 'Confirm next week''s Next Chapter guest: ' || v_session.guest
      else 'Invite and confirm a guest for Next Chapter: ' || v_session.title end;
    if not exists (select 1 from public.tasks where user_id = v_uid and session_id = v_session.id and title = v_title) then
      insert into public.tasks (user_id, cycle_id, session_id, title, description, category, priority, status, due_date, estimated_minutes, sort_order, created_at, updated_at)
      values (v_uid, v_cycle, v_session.id, v_title,
        'Confirm the Next Chapter guest seven days before the live session and update the session record.',
        'Next Chapter', 'high', 'todo', to_char(v_day,'YYYY-MM-DD'), 30, 20, v_stamp, v_stamp);
      v_count := v_count + 1;
    end if;
  end loop;

  if coalesce(v_settings.auto_plan,0) <> 1 then return v_count; end if;
  begin
    v_templates := coalesce(v_settings.daily_templates::jsonb, '[]'::jsonb);
  exception when others then
    v_templates := '[]'::jsonb;
  end;
  if jsonb_typeof(v_templates) <> 'array' then v_templates := '[]'::jsonb; end if;
  if exists (select 1 from public.generated_days where user_id = v_uid and day = to_char(v_day,'YYYY-MM-DD')) then
    return v_count;
  end if;

  v_plans := (select coalesce(jsonb_agg(value), '[]'::jsonb) from (select value from jsonb_array_elements(v_templates) limit 20) q);
  v_dow := extract(dow from v_day)::integer;
  if v_dow between 1 and 3 then
    v_plans := v_plans || jsonb_build_array(jsonb_build_object('title','Creative Project 1 — complete today''s planned milestone','category','Creative Studio','priority','high','estimated_minutes',120));
  end if;
  if v_dow in (4,5) then
    v_plans := v_plans || jsonb_build_array(jsonb_build_object('title','Creative Project 2 — complete today''s planned milestone','category','Creative Studio','priority','high','estimated_minutes',120));
  end if;
  if v_dow in (2,3,5) then
    v_plans := v_plans || jsonb_build_array(jsonb_build_object('title','Publish and distribute this week''s course-growth content','category','Course Growth','priority','high','estimated_minutes',45));
  end if;
  if v_dow in (2,4) then
    v_plans := v_plans || jsonb_build_array(jsonb_build_object('title','Develop one substantial Next Chapter content piece','category','Next Chapter','priority','medium','estimated_minutes',60));
  end if;
  if v_dow = 5 then
    v_plans := v_plans || jsonb_build_array(jsonb_build_object('title','Prepare and deliver the weekly Next Chapter live session','category','Next Chapter','priority','high','estimated_minutes',90));
    v_plans := v_plans || jsonb_build_array(jsonb_build_object('title','Review next week''s guest and session readiness','category','Next Chapter','priority','high','estimated_minutes',20));
  end if;
  if v_dow = 6 then
    v_plans := v_plans || jsonb_build_array(jsonb_build_object('title','Batch creative assets and prepare next week''s content drafts','category','Personal Brand','priority','high','estimated_minutes',90));
  end if;
  if v_dow = 0 then
    v_plans := v_plans || jsonb_build_array(jsonb_build_object('title','Batch content and prepare the coming week''s publishing schedule','category','Personal Brand','priority','high','estimated_minutes',90));
    v_plans := v_plans || jsonb_build_array(jsonb_build_object('title','Plan two creative projects and confirm weekly milestones','category','Creative Studio','priority','high','estimated_minutes',30));
    v_plans := v_plans || jsonb_build_array(jsonb_build_object('title','Create next Friday''s Next Chapter session plan and begin guest outreach','category','Next Chapter','priority','high','estimated_minutes',30));
  end if;

  insert into public.generated_days (user_id, day) values (v_uid, to_char(v_day,'YYYY-MM-DD')) on conflict do nothing;
  for v_item, v_ord in
    select value, ord::integer from jsonb_array_elements(v_plans) with ordinality as t(value, ord)
  loop
    if v_ord > 30 then exit; end if;
    if coalesce(v_item ->> 'title','') = '' then continue; end if;
    v_est := coalesce(v_item ->> 'estimated_minutes','');
    insert into public.tasks (user_id, cycle_id, title, category, priority, status, due_date, scheduled_time, estimated_minutes, sort_order, created_at, updated_at)
    values (
      v_uid, v_cycle,
      left(v_item ->> 'title', 200),
      left(coalesce(v_item ->> 'category','Personal'), 80),
      case when v_item ->> 'priority' in ('high','medium','low') then v_item ->> 'priority' else 'medium' end,
      'todo', to_char(v_day,'YYYY-MM-DD'), coalesce(v_item ->> 'scheduled_time',''),
      least(greatest(case when v_est ~ '^[0-9]+(\.[0-9]+)?$' then v_est::numeric else 0 end, 0), 1440)::integer,
      v_ord - 1, v_stamp, v_stamp
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$fn$;

-- Deterministic "Momentum AI" assistant: reads only real records and writes
-- suggestions plus a daily brief. Replace rules-v1 with a model call later.
create or replace function public.generate_ai_suggestions(p_day date default null)
returns integer language plpgsql security definer set search_path = public as $fn$
declare
  v_uid uuid := auth.uid();
  v_day date;
  v_month text;
  v_day_text text;
  v_sales_target integer := 0;
  v_outreach_target integer := 0;
  v_paid bigint := 0;
  v_revenue numeric := 0;
  v_outreach bigint := 0;
  v_overdue bigint := 0;
  v_followups bigint := 0;
  v_ideas bigint := 0;
  v_sessions bigint := 0;
  v_count integer := 0;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  v_day := coalesce(p_day, (now() at time zone 'Africa/Lagos')::date);
  v_day_text := to_char(v_day,'YYYY-MM-DD');
  v_month := to_char(v_day,'YYYY-MM');
  select coalesce(max(sales_target),0), coalesce(max(outreach_target),0)
    into v_sales_target, v_outreach_target
    from public.cycles where user_id = v_uid and month = v_month;
  select count(*), coalesce(sum(amount),0) into v_paid, v_revenue
    from public.sales where user_id = v_uid and status = 'paid' and amount > 0 and sale_date like v_month || '%';
  select count(*) into v_outreach from public.interactions
    where user_id = v_uid and kind = 'outreach' and occurred_date like v_month || '%';
  select count(*) into v_overdue from public.tasks
    where user_id = v_uid and status in ('todo','in_progress')
      and due_date is not null and due_date < v_day_text;
  select count(*) into v_followups from (
    select id from public.leads where user_id = v_uid and follow_up_date is not null
      and follow_up_date <= v_day_text and status not in ('Converted','Not interested')
    union all
    select id from public.prospects where user_id = v_uid and follow_up_date is not null
      and follow_up_date <= v_day_text and status not in ('Won','Lost','Not a fit')
  ) q;
  select count(*) into v_ideas from public.content_items where user_id = v_uid and status = 'Idea';
  select count(*) into v_sessions from public.chapter_sessions
    where user_id = v_uid and session_date between v_day_text and to_char(v_day + 14,'YYYY-MM-DD')
      and status not in ('Archived','Completed');

  with candidates as (
    select * from (values
      ('sales-pace-' || v_month, 'Course Growth', 'Course sales pace',
        format('%s of %s paid course sales recorded this month. Review promotions and enquiry follow-ups.', v_paid, v_sales_target),
        'high', 0.90::numeric, (v_sales_target > 0 and v_paid < v_sales_target)),
      ('overdue-' || v_day_text, 'My Day', 'Unfinished plans need a decision',
        format('%s tasks are open with a due date before %s. Carry them forward explicitly or close them.', v_overdue, v_day_text),
        'high', 0.95::numeric, (v_overdue > 0)),
      ('followups-' || v_day_text, 'Client Pipeline', 'Follow-ups are due',
        format('%s enquiries or prospects have a follow-up date due now. Record the actual contact after you make it.', v_followups),
        'high', 0.92::numeric, (v_followups > 0)),
      ('outreach-pace-' || v_month, 'Client Pipeline', 'Outreach pace',
        format('%s of %s recorded outreach actions this month. Research does not count until outreach is logged.', v_outreach, v_outreach_target),
        'medium', 0.85::numeric, (v_outreach_target > 0 and v_outreach < v_outreach_target)),
      ('idea-bank-' || v_day_text, 'Personal Brand', 'Turn ideas into drafts',
        format('%s content items are still at Idea stage. Draft one and set a planned date.', v_ideas),
        'medium', 0.80::numeric, (v_ideas > 0)),
      ('session-plan-' || v_day_text, 'Next Chapter', 'No upcoming session on the calendar',
        'No active Next Chapter session is scheduled in the next 14 days. Plan one and begin guest outreach.',
        'medium', 0.80::numeric, (v_sessions = 0))
    ) as c(dedupe_key, category, title, body, priority, confidence, active)
    where active
  ),
  inserted as (
    insert into public.ai_suggestions (user_id, dedupe_key, category, title, body, priority, confidence, source, related_entity_type, created_at, updated_at)
    select v_uid, dedupe_key, category, title, body, priority, confidence, 'rules-v1', category, now(), now()
    from candidates
    on conflict (user_id, dedupe_key) do nothing
    returning 1
  )
  select count(*) into v_count from inserted;

  insert into public.ai_daily_briefs (user_id, day, content, created_at, updated_at)
  values (v_uid, v_day_text, jsonb_build_object(
      'day', v_day_text, 'month', v_month, 'paid_sales', v_paid,
      'realised_revenue', v_revenue, 'sales_target', v_sales_target,
      'outreach_actions', v_outreach, 'outreach_target', v_outreach_target,
      'overdue_tasks', v_overdue, 'due_followups', v_followups,
      'idea_backlog', v_ideas, 'upcoming_sessions', v_sessions,
      'engine', 'rules-v1 (no external model configured)'
    ), now(), now())
  on conflict (user_id, day) do update set content = excluded.content, updated_at = now();

  insert into public.ai_runs (user_id, kind, model, input, output, status, created_at)
  values (v_uid, 'daily_brief', 'rules-v1', jsonb_build_object('day', v_day_text),
    jsonb_build_object('suggestions_created', v_count), 'completed', now());
  return v_count;
end;
$fn$;

-- Lightweight audit trail of recorded activity.
create or replace function public.log_activity()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  insert into public.activity_events (user_id, entity_type, entity_id, action, summary, created_at)
  values (new.user_id, tg_table_name, new.id, lower(tg_op), tg_table_name || ' ' || lower(tg_op), now());
  return new;
end;
$fn$;

do $$
declare t text;
begin
  foreach t in array array['tasks','sales','projects','content_items','chapter_sessions','leads','prospects'] loop
    execute format('drop trigger if exists trg_%s_activity on public.%I', t, t);
    execute format('create trigger trg_%s_activity after insert or update on public.%I for each row execute function public.log_activity()', t, t);
  end loop;
end;
$$;

create or replace view public.v_open_tasks with (security_invoker = true) as
  select id, user_id, title, category, priority, status, due_date, scheduled_time,
         estimated_minutes, created_at
  from public.tasks
  where user_id = auth.uid() and status in ('todo','in_progress');

create or replace view public.v_sales_summary with (security_invoker = true) as
  select user_id, sale_date,
         count(*) filter (where status = 'paid' and amount > 0) as paid_sales,
         coalesce(sum(amount) filter (where status = 'paid' and amount > 0), 0) as realised_revenue
  from public.sales
  where user_id = auth.uid()
  group by user_id, sale_date;

create or replace view public.v_ai_inbox with (security_invoker = true) as
  select id, user_id, category, title, body, priority, confidence, status, created_at
  from public.ai_suggestions
  where user_id = auth.uid() and status = 'pending';

grant select on public.v_open_tasks, public.v_sales_summary, public.v_ai_inbox to authenticated;
revoke all on function public.momentum_health() from public;
grant execute on function public.momentum_health() to anon, authenticated, service_role;
revoke all on function public.command_centre(text) from public;
revoke all on function public.workspace_bootstrap() from public;
revoke all on function public.ensure_daily_plan(date) from public;
revoke all on function public.generate_ai_suggestions(date) from public;
grant execute on function public.command_centre(text) to authenticated, service_role;
grant execute on function public.workspace_bootstrap() to authenticated, service_role;
grant execute on function public.ensure_daily_plan(date) to authenticated, service_role;
grant execute on function public.generate_ai_suggestions(date) to authenticated, service_role;
