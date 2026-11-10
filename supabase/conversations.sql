-- Run in Supabase → SQL Editor. Safe to re-run.
-- Issue #63: private conversation per application between the volunteer
-- and the project owner. Writes go through RPCs; table writes stay revoked.

-- 1) Tables
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.conversations'::regclass
      and conname = 'conversations_application_id_fkey'
  ) then
    alter table public.conversations
      add constraint conversations_application_id_fkey
      foreign key (application_id) references public.applications (id) on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.conversations'::regclass
      and conname = 'conversations_application_id_key'
  ) then
    alter table public.conversations
      add constraint conversations_application_id_key unique (application_id);
  end if;
end $$;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  sender_id uuid not null,
  body text not null,
  created_at timestamptz not null default clock_timestamp(),
  client_message_id uuid not null
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.messages'::regclass
      and conname = 'messages_conversation_id_fkey'
  ) then
    alter table public.messages
      add constraint messages_conversation_id_fkey
      foreign key (conversation_id) references public.conversations (id) on delete cascade;
  end if;
end $$;

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.messages'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%body%'
  loop
    execute format('alter table public.messages drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.messages
  add constraint messages_body_check
  check (
    body is not null
    and btrim(body) <> ''
    and char_length(body) <= 4000
  );

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.messages'::regclass
      and conname = 'messages_sender_client_message_id_key'
  ) then
    alter table public.messages
      add constraint messages_sender_client_message_id_key
      unique (sender_id, client_message_id);
  end if;
end $$;

create index if not exists messages_conversation_created_id_idx
  on public.messages (conversation_id, created_at, id);

create table if not exists public.conversation_reads (
  conversation_id uuid not null,
  user_id uuid not null,
  last_read_message_id uuid,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.conversation_reads'::regclass
      and conname = 'conversation_reads_conversation_id_fkey'
  ) then
    alter table public.conversation_reads
      add constraint conversation_reads_conversation_id_fkey
      foreign key (conversation_id) references public.conversations (id) on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.conversation_reads'::regclass
      and conname = 'conversation_reads_last_read_message_id_fkey'
  ) then
    alter table public.conversation_reads
      add constraint conversation_reads_last_read_message_id_fkey
      foreign key (last_read_message_id) references public.messages (id) on delete set null;
  end if;
end $$;

-- 2) Membership helper (security definer so closed projects stay visible)
create or replace function public.is_application_messaging_participant(p_application_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.applications a
    join public.posts p on p.id::text = a.project_id::text
    where a.id = p_application_id
      and (
        a.volunteer_id::text = auth.uid()::text
        or p.user_id::text = auth.uid()::text
      )
  );
$$;

create or replace function public.is_conversation_participant(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and public.is_application_messaging_participant(c.application_id)
  );
$$;

revoke all on function public.is_application_messaging_participant(uuid) from public, anon;
revoke all on function public.is_conversation_participant(uuid) from public, anon;
grant execute on function public.is_application_messaging_participant(uuid) to authenticated;
grant execute on function public.is_conversation_participant(uuid) to authenticated;

-- 3) Row-level security
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.conversation_reads enable row level security;

drop policy if exists "conversations_select_participant" on public.conversations;
create policy "conversations_select_participant"
  on public.conversations for select
  to authenticated
  using (public.is_application_messaging_participant(application_id));

drop policy if exists "messages_select_participant" on public.messages;
create policy "messages_select_participant"
  on public.messages for select
  to authenticated
  using (public.is_conversation_participant(conversation_id));

drop policy if exists "conversation_reads_select_own" on public.conversation_reads;
create policy "conversation_reads_select_own"
  on public.conversation_reads for select
  to authenticated
  using (user_id::text = auth.uid()::text);

revoke all on table public.conversations from anon, authenticated;
revoke all on table public.messages from anon, authenticated;
revoke all on table public.conversation_reads from anon, authenticated;
grant select on table public.conversations to authenticated;
grant select on table public.messages to authenticated;
grant select on table public.conversation_reads to authenticated;

-- 4) Send message
create or replace function public.send_application_message(
  p_application_id uuid,
  p_body text,
  p_client_message_id uuid
)
returns public.messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
  v_conversation_id uuid;
  v_message public.messages;
  v_existing public.messages;
begin
  if v_uid is null then
    raise exception 'Not allowed to access this conversation'
      using errcode = '42501';
  end if;

  select a.status
  into v_status
  from public.applications a
  join public.posts p on p.id::text = a.project_id::text
  where a.id = p_application_id
    and (
      a.volunteer_id::text = v_uid::text
      or p.user_id::text = v_uid::text
    );

  if v_status is null then
    raise exception 'Not allowed to access this conversation'
      using errcode = '42501';
  end if;

  if v_status = 'rejected' then
    raise exception 'Conversation is read-only because the application was rejected'
      using errcode = 'P0001';
  end if;

  if p_client_message_id is null then
    raise exception 'client_message_id is required'
      using errcode = '22023';
  end if;

  if p_body is null or btrim(p_body) = '' then
    raise exception 'Message body must not be empty'
      using errcode = '23514';
  end if;

  if char_length(p_body) > 4000 then
    raise exception 'Message body must be at most 4000 characters'
      using errcode = '23514';
  end if;

  insert into public.conversations (application_id)
  values (p_application_id)
  on conflict (application_id) do nothing;

  select c.id into v_conversation_id
  from public.conversations c
  where c.application_id = p_application_id;

  insert into public.messages (
    conversation_id,
    sender_id,
    body,
    client_message_id
  )
  values (
    v_conversation_id,
    v_uid,
    p_body,
    p_client_message_id
  )
  on conflict (sender_id, client_message_id) do nothing
  returning * into v_message;

  if v_message.id is not null then
    return v_message;
  end if;

  select m.* into v_existing
  from public.messages m
  where m.sender_id = v_uid
    and m.client_message_id = p_client_message_id;

  if v_existing.conversation_id = v_conversation_id
     and v_existing.body = p_body then
    return v_existing;
  end if;

  raise exception 'Duplicate client_message_id'
    using errcode = '23505';
end;
$$;

revoke all on function public.send_application_message(uuid, text, uuid) from public, anon;
grant execute on function public.send_application_message(uuid, text, uuid) to authenticated;

-- 5) List conversations for the caller
create or replace function public.list_conversations()
returns table (
  conversation_id uuid,
  application_id uuid,
  application_status text,
  project_id uuid,
  project_title text,
  organization_name text,
  volunteer_id uuid,
  owner_id uuid,
  caller_role text,
  can_send boolean,
  last_message_id uuid,
  last_message_body text,
  last_message_created_at timestamptz,
  last_message_sender_id uuid,
  last_read_message_id uuid,
  last_read_at timestamptz,
  unread_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select
      c.id as conversation_id,
      a.id as application_id,
      a.status as application_status,
      a.project_id::uuid as project_id,
      p.title as project_title,
      p.organization_name,
      a.volunteer_id::uuid as volunteer_id,
      p.user_id::uuid as owner_id,
      case
        when a.volunteer_id::text = auth.uid()::text then 'volunteer'
        else 'owner'
      end as caller_role,
      (a.status in ('pending', 'approved')) as can_send
    from public.conversations c
    join public.applications a on a.id = c.application_id
    join public.posts p on p.id::text = a.project_id::text
    where a.volunteer_id::text = auth.uid()::text
       or p.user_id::text = auth.uid()::text
  ),
  latest as (
    select distinct on (m.conversation_id)
      m.conversation_id,
      m.id as last_message_id,
      m.body as last_message_body,
      m.created_at as last_message_created_at,
      m.sender_id as last_message_sender_id
    from public.messages m
    join mine on mine.conversation_id = m.conversation_id
    order by m.conversation_id, m.created_at desc, m.id desc
  ),
  reads as (
    select
      r.conversation_id,
      r.last_read_message_id,
      r.last_read_at,
      lm.created_at as last_read_created_at
    from public.conversation_reads r
    left join public.messages lm on lm.id = r.last_read_message_id
    where r.user_id::text = auth.uid()::text
  )
  select
    mine.conversation_id,
    mine.application_id,
    mine.application_status,
    mine.project_id,
    mine.project_title,
    mine.organization_name,
    mine.volunteer_id,
    mine.owner_id,
    mine.caller_role,
    mine.can_send,
    latest.last_message_id,
    latest.last_message_body,
    latest.last_message_created_at,
    latest.last_message_sender_id,
    reads.last_read_message_id,
    reads.last_read_at,
    (
      select count(*)::bigint
      from public.messages um
      where um.conversation_id = mine.conversation_id
        and um.sender_id::text <> auth.uid()::text
        and (
          reads.last_read_message_id is null
          or (um.created_at, um.id) > (reads.last_read_created_at, reads.last_read_message_id)
        )
    ) as unread_count
  from mine
  left join latest on latest.conversation_id = mine.conversation_id
  left join reads on reads.conversation_id = mine.conversation_id
  order by
    latest.last_message_created_at desc nulls last,
    mine.conversation_id;
$$;

revoke all on function public.list_conversations() from public, anon;
grant execute on function public.list_conversations() to authenticated;

-- 6) Paginated message history
create or replace function public.list_messages(
  p_conversation_id uuid,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_page_size integer default 50
)
returns setof public.messages
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_page_size integer;
begin
  if auth.uid() is null or not public.is_conversation_participant(p_conversation_id) then
    raise exception 'Not allowed to access this conversation'
      using errcode = '42501';
  end if;

  if (p_before_created_at is null) <> (p_before_id is null) then
    raise exception 'before_created_at and before_id must both be provided or both omitted'
      using errcode = '22023';
  end if;

  v_page_size := coalesce(p_page_size, 50);
  if v_page_size < 1 or v_page_size > 100 then
    raise exception 'page_size must be between 1 and 100'
      using errcode = '22023';
  end if;

  return query
  with page as (
    select m.*
    from public.messages m
    where m.conversation_id = p_conversation_id
      and (
        p_before_created_at is null
        or (m.created_at, m.id) < (p_before_created_at, p_before_id)
      )
    order by m.created_at desc, m.id desc
    limit v_page_size
  )
  select page.*
  from page
  order by page.created_at asc, page.id asc;
end;
$$;

revoke all on function public.list_messages(uuid, timestamptz, uuid, integer) from public, anon;
grant execute on function public.list_messages(uuid, timestamptz, uuid, integer) to authenticated;

-- 7) Application conversation context (does not create a row)
create or replace function public.get_application_conversation(p_application_id uuid)
returns table (
  conversation_id uuid,
  application_id uuid,
  application_status text,
  project_id uuid,
  project_title text,
  organization_name text,
  volunteer_id uuid,
  owner_id uuid,
  caller_role text,
  can_send boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not allowed to access this conversation'
      using errcode = '42501';
  end if;

  return query
  select
    c.id as conversation_id,
    a.id as application_id,
    a.status as application_status,
    a.project_id::uuid as project_id,
    p.title as project_title,
    p.organization_name,
    a.volunteer_id::uuid as volunteer_id,
    p.user_id::uuid as owner_id,
    case
      when a.volunteer_id::text = v_uid::text then 'volunteer'
      else 'owner'
    end as caller_role,
    (a.status in ('pending', 'approved')) as can_send
  from public.applications a
  join public.posts p on p.id::text = a.project_id::text
  left join public.conversations c on c.application_id = a.id
  where a.id = p_application_id
    and (
      a.volunteer_id::text = v_uid::text
      or p.user_id::text = v_uid::text
    );

  if not found then
    raise exception 'Not allowed to access this conversation'
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.get_application_conversation(uuid) from public, anon;
grant execute on function public.get_application_conversation(uuid) to authenticated;

-- 8) Mark conversation read (forward-only cursor)
create or replace function public.mark_conversation_read(
  p_conversation_id uuid,
  p_message_id uuid default null
)
returns public.conversation_reads
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_target public.messages;
  v_existing public.conversation_reads;
  v_existing_msg public.messages;
  v_result public.conversation_reads;
begin
  if v_uid is null or not public.is_conversation_participant(p_conversation_id) then
    raise exception 'Not allowed to access this conversation'
      using errcode = '42501';
  end if;

  if p_message_id is null then
    select m.* into v_target
    from public.messages m
    where m.conversation_id = p_conversation_id
    order by m.created_at desc, m.id desc
    limit 1;
  else
    select m.* into v_target
    from public.messages m
    where m.id = p_message_id
      and m.conversation_id = p_conversation_id;

    if v_target.id is null then
      raise exception 'Message not found in this conversation'
        using errcode = 'P0002';
    end if;
  end if;

  if v_target.id is null then
    select r.* into v_result
    from public.conversation_reads r
    where r.conversation_id = p_conversation_id
      and r.user_id = v_uid;

    if v_result.user_id is null then
      insert into public.conversation_reads (conversation_id, user_id, last_read_message_id, last_read_at)
      values (p_conversation_id, v_uid, null, now())
      returning * into v_result;
    end if;

    return v_result;
  end if;

  select r.* into v_existing
  from public.conversation_reads r
  where r.conversation_id = p_conversation_id
    and r.user_id = v_uid;

  if v_existing.last_read_message_id is not null then
    select m.* into v_existing_msg
    from public.messages m
    where m.id = v_existing.last_read_message_id;

    if v_existing_msg.id is not null
       and (v_target.created_at, v_target.id)
         <= (v_existing_msg.created_at, v_existing_msg.id) then
      return v_existing;
    end if;
  end if;

  insert into public.conversation_reads (
    conversation_id,
    user_id,
    last_read_message_id,
    last_read_at
  )
  values (
    p_conversation_id,
    v_uid,
    v_target.id,
    now()
  )
  on conflict (conversation_id, user_id) do update
    set last_read_message_id = excluded.last_read_message_id,
        last_read_at = excluded.last_read_at
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.mark_conversation_read(uuid, uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid, uuid) to authenticated;

-- 9) Realtime for open conversation refresh (#64). Skip when publication is absent.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'messages'
    ) then
      execute 'alter publication supabase_realtime add table public.messages';
    end if;
  end if;
end $$;
