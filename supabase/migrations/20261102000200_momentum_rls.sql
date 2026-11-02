-- Momentum AI — row level security.
-- Personal records are owner-only. Shared team records are visible only to
-- active members of that workspace; assignees see only their own assignments.

create or replace function public.current_account_type()
returns text language sql stable security definer set search_path = public as $$
  select account_type from public.profiles where id = auth.uid();
$$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and account_type = 'owner');
$$;

create or replace function public.is_workspace_member(p_workspace uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.team_members
    where workspace_id = p_workspace and user_id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.is_workspace_manager(p_workspace uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.team_members
    where workspace_id = p_workspace and user_id = auth.uid()
      and status = 'active' and role in ('owner', 'manager')
  );
$$;

grant execute on function
  public.current_account_type(),
  public.is_owner(),
  public.is_workspace_member(uuid),
  public.is_workspace_manager(uuid)
to authenticated, service_role;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','settings','cycles','products','projects','chapter_sessions','tasks',
    'generated_days','sales','leads','campaigns','promotions','prospects',
    'interactions','jobs','content_items','session_checklists','daily_notes',
    'weekly_reviews','team_workspaces','team_members','team_invites','team_goals',
    'team_tasks','team_comments','team_activity','ai_runs','ai_suggestions',
    'ai_daily_briefs','activity_events'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- Owner-only personal tables ----------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'settings','cycles','products','projects','chapter_sessions','tasks',
    'generated_days','sales','leads','campaigns','promotions','prospects',
    'interactions','jobs','content_items','session_checklists','daily_notes',
    'weekly_reviews','ai_runs','ai_suggestions','ai_daily_briefs','activity_events'
  ] loop
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format(
      'create policy own_rows on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t
    );
  end loop;
end;
$$;

drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Shared team layer -------------------------------------------------------
drop policy if exists workspaces_read on public.team_workspaces;
create policy workspaces_read on public.team_workspaces for select to authenticated
  using (owner_user_id = auth.uid() or public.is_workspace_member(id));
drop policy if exists workspaces_write on public.team_workspaces;
create policy workspaces_write on public.team_workspaces for insert to authenticated
  with check (owner_user_id = auth.uid());
drop policy if exists workspaces_manage on public.team_workspaces;
create policy workspaces_manage on public.team_workspaces for update to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
drop policy if exists workspaces_delete on public.team_workspaces;
create policy workspaces_delete on public.team_workspaces for delete to authenticated
  using (owner_user_id = auth.uid());

drop policy if exists members_read on public.team_members;
create policy members_read on public.team_members for select to authenticated
  using (user_id = auth.uid() or public.is_workspace_manager(workspace_id));
drop policy if exists members_manage on public.team_members;
create policy members_manage on public.team_members for all to authenticated
  using (public.is_workspace_manager(workspace_id) and role <> 'owner')
  with check (public.is_workspace_manager(workspace_id) and role <> 'owner');

drop policy if exists invites_manage on public.team_invites;
create policy invites_manage on public.team_invites for all to authenticated
  using (public.is_workspace_manager(workspace_id))
  with check (public.is_workspace_manager(workspace_id));

drop policy if exists goals_read on public.team_goals;
create policy goals_read on public.team_goals for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists goals_manage on public.team_goals;
create policy goals_manage on public.team_goals for all to authenticated
  using (public.is_workspace_manager(workspace_id))
  with check (public.is_workspace_manager(workspace_id));

drop policy if exists team_tasks_read on public.team_tasks;
create policy team_tasks_read on public.team_tasks for select to authenticated
  using (public.is_workspace_manager(workspace_id) or assignee_user_id = auth.uid());
drop policy if exists team_tasks_create on public.team_tasks;
create policy team_tasks_create on public.team_tasks for insert to authenticated
  with check (public.is_workspace_manager(workspace_id));
drop policy if exists team_tasks_update on public.team_tasks;
create policy team_tasks_update on public.team_tasks for update to authenticated
  using (public.is_workspace_manager(workspace_id) or assignee_user_id = auth.uid())
  with check (
    public.is_workspace_manager(workspace_id)
    or (assignee_user_id = auth.uid() and status in ('assigned','in_progress','submitted'))
  );
drop policy if exists team_tasks_delete on public.team_tasks;
create policy team_tasks_delete on public.team_tasks for delete to authenticated
  using (public.is_workspace_manager(workspace_id));

drop policy if exists team_comments_read on public.team_comments;
create policy team_comments_read on public.team_comments for select to authenticated
  using (exists (
    select 1 from public.team_tasks t
    where t.id = task_id
      and (public.is_workspace_manager(t.workspace_id) or t.assignee_user_id = auth.uid())
  ));
drop policy if exists team_comments_create on public.team_comments;
create policy team_comments_create on public.team_comments for insert to authenticated
  with check (
    user_id = auth.uid() and exists (
      select 1 from public.team_tasks t
      where t.id = task_id
        and (public.is_workspace_manager(t.workspace_id) or t.assignee_user_id = auth.uid())
    )
  );
drop policy if exists team_comments_delete on public.team_comments;
create policy team_comments_delete on public.team_comments for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists team_activity_read on public.team_activity;
create policy team_activity_read on public.team_activity for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists team_activity_create on public.team_activity;
create policy team_activity_create on public.team_activity for insert to authenticated
  with check (actor_user_id = auth.uid() or public.is_workspace_manager(workspace_id));

-- The anonymous (publishable) key must never read operational rows.
revoke all on all tables in schema public from anon;
