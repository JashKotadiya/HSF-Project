-- Issue #109: Deterministic project ↔ volunteer matching.
-- Supplies the ranking contract for #93 / #94 / #95.
--
-- Algorithm (weighted multi-signal relevance, no randomness, no embeddings):
--   cause_score  = 50 when the project's cause is one of the caller's saved interests
--   skill_score  = 40 * Jaccard(caller skills, project skills_needed)
--   peer_score   = 10 when at least MIN_PEER_COHORT similar volunteers have an
--                  approved application on the project; otherwise 0
--   total_score  = cause_score + skill_score + peer_score  (0..100)
--
-- Tie-break (deterministic): total_score DESC, created_at DESC, id ASC.
-- Eligible listings: Active projects the caller has not already applied to.
-- Peer similarity: shares at least one interest cause, or skill Jaccard >= 0.25.
-- Peer responses never include other users' identities, bios, resumes, or contacts.
-- Run in Supabase → SQL Editor. Safe to re-run.

begin;

create or replace function public.normalize_skill_label(p_value text)
returns text
language sql
immutable
as $$
  select nullif(lower(btrim(coalesce(p_value, ''))), '');
$$;

create or replace function public.project_skill_labels(p_skills jsonb)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(distinct public.normalize_skill_label(elem)), '{}'::text[])
  from (
    select jsonb_array_elements_text(
      case
        when p_skills is null then '[]'::jsonb
        when jsonb_typeof(p_skills) = 'array' then p_skills
        else '[]'::jsonb
      end
    ) as elem
  ) skills
  where public.normalize_skill_label(elem) is not null;
$$;

create or replace function public.skill_jaccard(p_left text[], p_right text[])
returns numeric
language sql
immutable
as $$
  with left_skills as (
    select distinct public.normalize_skill_label(value) as skill
    from unnest(coalesce(p_left, '{}'::text[])) as value
    where public.normalize_skill_label(value) is not null
  ),
  right_skills as (
    select distinct public.normalize_skill_label(value) as skill
    from unnest(coalesce(p_right, '{}'::text[])) as value
    where public.normalize_skill_label(value) is not null
  ),
  counts as (
    select
      (select count(*)::numeric from left_skills) as left_count,
      (select count(*)::numeric from right_skills) as right_count,
      (
        select count(*)::numeric
        from left_skills l
        join right_skills r on r.skill = l.skill
      ) as shared_count
  )
  select case
    when left_count = 0 or right_count = 0 then 0
    when shared_count = 0 then 0
    else shared_count / (left_count + right_count - shared_count)
  end
  from counts;
$$;

-- Caller's own recommendation signals (#93). Never returns another account's data.
create or replace function public.get_my_recommendation_signals()
returns table (
  volunteer_id uuid,
  interests text[],
  skills text[],
  pending_application_count integer,
  approved_participation_count integer,
  has_interests boolean,
  has_skills boolean,
  cold_start boolean
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
    raise exception 'Sign in required'
      using errcode = '42501';
  end if;

  return query
  with interest_rows as (
    select coalesce(array_agg(vi.cause order by vi.cause), '{}'::text[]) as interest_list
    from public.volunteer_interests vi
    where vi.volunteer_id = v_uid
  ),
  skill_rows as (
    select coalesce(public.project_skill_labels(p.technical_skills), '{}'::text[]) as skill_list
    from public.profiles p
    where p.id = v_uid
  ),
  app_counts as (
    select
      count(*) filter (where a.status = 'pending')::integer as pending_count,
      count(*) filter (where a.status = 'approved')::integer as approved_count
    from public.applications a
    where a.volunteer_id = v_uid
  )
  select
    v_uid,
    (select interest_list from interest_rows),
    coalesce((select skill_list from skill_rows), '{}'::text[]),
    coalesce((select pending_count from app_counts), 0),
    coalesce((select approved_count from app_counts), 0),
    cardinality((select interest_list from interest_rows)) > 0,
    cardinality(coalesce((select skill_list from skill_rows), '{}'::text[])) > 0,
    cardinality((select interest_list from interest_rows)) = 0
      and cardinality(coalesce((select skill_list from skill_rows), '{}'::text[])) = 0;
end;
$$;

revoke all on function public.get_my_recommendation_signals() from public, anon;
grant execute on function public.get_my_recommendation_signals() to authenticated;

-- Ranked recommendations for the signed-in volunteer (#109 / #94).
create or replace function public.recommend_projects(
  p_limit integer default 12,
  p_offset integer default 0
)
returns table (
  id text,
  user_id uuid,
  title text,
  content text,
  status text,
  created_at timestamptz,
  organization_name text,
  location text,
  cause text,
  skills_needed jsonb,
  score numeric,
  cause_score numeric,
  skill_score numeric,
  peer_score numeric,
  reasons text[],
  ranking_mode text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 12), 50));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_interests text[] := '{}'::text[];
  v_skills text[] := '{}'::text[];
  v_cold_start boolean := true;
  -- Privacy: peer boost only when this many similar volunteers already joined.
  c_min_peer_cohort constant integer := 3;
  c_peer_jaccard constant numeric := 0.25;
begin
  if v_uid is null then
    raise exception 'Sign in required'
      using errcode = '42501';
  end if;

  select coalesce(array_agg(vi.cause order by vi.cause), '{}'::text[])
  into v_interests
  from public.volunteer_interests vi
  where vi.volunteer_id = v_uid;

  select public.project_skill_labels(p.technical_skills)
  into v_skills
  from public.profiles p
  where p.id = v_uid;

  v_skills := coalesce(v_skills, '{}'::text[]);
  v_cold_start := cardinality(v_interests) = 0 and cardinality(v_skills) = 0;

  return query
  with my_apps as (
    select a.project_id::text as project_id
    from public.applications a
    where a.volunteer_id = v_uid
  ),
  eligible as (
    select
      p.id::text as id,
      p.user_id::uuid as user_id,
      p.title,
      p.content,
      p.status,
      p.created_at,
      p.organization_name,
      p.location,
      p.cause,
      p.skills_needed,
      public.project_skill_labels(p.skills_needed) as project_skills,
      exists (
        select 1
        from unnest(v_interests) interest
        where lower(btrim(interest)) = lower(btrim(coalesce(p.cause, '')))
      ) as cause_match,
      public.skill_jaccard(v_skills, public.project_skill_labels(p.skills_needed)) as skill_overlap
    from public.posts p
    where lower(p.status) = 'active'
      and not exists (
        select 1 from my_apps m where m.project_id = p.id::text
      )
  ),
  similar_volunteers as (
    select peer.id as peer_id
    from public.profiles peer
    where peer.id <> v_uid
      and lower(coalesce(peer.role, 'volunteer')) not in ('nonprofit', 'organization', 'org')
      and (
        exists (
          select 1
          from public.volunteer_interests mine
          join public.volunteer_interests theirs
            on lower(btrim(theirs.cause)) = lower(btrim(mine.cause))
          where mine.volunteer_id = v_uid
            and theirs.volunteer_id = peer.id
        )
        or public.skill_jaccard(v_skills, public.project_skill_labels(peer.technical_skills)) >= c_peer_jaccard
      )
  ),
  peer_counts as (
    select
      a.project_id::text as project_id,
      count(distinct a.volunteer_id)::integer as similar_approved_count
    from public.applications a
    join similar_volunteers sv on sv.peer_id = a.volunteer_id
    where a.status = 'approved'
    group by a.project_id::text
  ),
  scored as (
    select
      e.*,
      case when e.cause_match then 50::numeric else 0::numeric end as cause_score,
      round(40 * e.skill_overlap, 2) as skill_score,
      case
        when coalesce(pc.similar_approved_count, 0) >= c_min_peer_cohort then 10::numeric
        else 0::numeric
      end as peer_score,
      coalesce(pc.similar_approved_count, 0) as similar_approved_count
    from eligible e
    left join peer_counts pc on pc.project_id = e.id
  ),
  explained as (
    select
      s.*,
      (s.cause_score + s.skill_score + s.peer_score) as total_score,
      case
        when v_cold_start then 'cold_start'
        when (s.cause_score + s.skill_score + s.peer_score) > 0 then 'personalized'
        else 'general'
      end as ranking_mode,
      (
        select coalesce(array_agg(reason order by ordinality), '{}'::text[])
        from (
          select reason, ordinality
          from unnest(
            array_remove(array[
              case
                when s.cause_match then format('Matches your interest in %s', btrim(s.cause))
                else null
              end,
              case
                when s.skill_overlap > 0 then format(
                  'Shares %s of your skills (%s)',
                  (
                    select count(*)::text
                    from unnest(v_skills) mine
                    join unnest(s.project_skills) needed
                      on needed = mine
                  ),
                  (
                    select string_agg(mine, ', ' order by mine)
                    from unnest(v_skills) mine
                    join unnest(s.project_skills) needed
                      on needed = mine
                  )
                )
                else null
              end,
              case
                when s.peer_score > 0
                  then 'Volunteers with similar profiles have joined this project'
                else null
              end,
              case
                when v_cold_start
                  then 'Active opportunity — add skills and interests on your profile for better matches'
                when (s.cause_score + s.skill_score + s.peer_score) = 0
                  then 'Active opportunity that fits the general listing order'
                else null
              end
            ], null)
          ) with ordinality as items(reason, ordinality)
        ) reasons
      ) as reasons
    from scored s
  )
  select
    e.id,
    e.user_id,
    e.title,
    e.content,
    e.status,
    e.created_at,
    e.organization_name,
    e.location,
    e.cause,
    e.skills_needed,
    e.total_score as score,
    e.cause_score,
    e.skill_score,
    e.peer_score,
    e.reasons,
    e.ranking_mode
  from explained e
  order by
    e.total_score desc,
    e.created_at desc nulls last,
    e.id asc
  limit v_limit
  offset v_offset;
end;
$$;

revoke all on function public.normalize_skill_label(text) from public, anon, authenticated;
revoke all on function public.project_skill_labels(jsonb) from public, anon, authenticated;
revoke all on function public.skill_jaccard(text[], text[]) from public, anon, authenticated;
revoke all on function public.recommend_projects(integer, integer) from public, anon;
grant execute on function public.recommend_projects(integer, integer) to authenticated;

commit;
