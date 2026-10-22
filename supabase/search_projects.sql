
-- Issue #9: Backend/Database Search & Filtering Logic
--
-- Search volunteer projects by keyword, status, and skills.
--
-- Project data: public.posts
-- Technology requirements: skills_needed
--
-- All filters are optional.
-- By default, searches return Active projects.
-- Users can also search their own Draft/Closed projects.
--
-- Uses the caller's permissions and existing RLS policies.

create or replace function public.search_projects(
  p_keyword text default null,
  p_status text default 'Active',
  p_tech_stack text[] default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns setof public.posts
language sql
stable
security invoker
set search_path = ''
as $$
  select p.*
  from public.posts as p
  where

    -- Public users only see Active projects.
    -- Owners may also see their own projects.
    (
      lower(p.status) = 'active'
      or p.user_id::text = (select auth.uid())::text
    )

    -- Filter by project status.
    and (
      nullif(trim(p_status), '') is null
      or lower(p.status) = lower(trim(p_status))
    )

    -- Keyword search.
    and (
      nullif(trim(p_keyword), '') is null

      or to_tsvector(
        'english',
        concat_ws(
          ' ',
          p.title,
          p.content,
          p.cause,
          p.skills_needed::text
        )
      ) @@ plainto_tsquery(
        'english',
        trim(p_keyword)
      )

      -- Also support partial/exact keyword matches.
      or concat_ws(
        ' ',
        p.title,
        p.content,
        p.cause,
        p.skills_needed::text
      ) ilike '%' || trim(p_keyword) || '%'
    )

    -- Match every requested skill.
    -- Convert skills_needed to JSONB so this works
    -- with a PostgreSQL array or JSONB array.
    
-- Match all requested technologies (case-insensitive).
and (
  coalesce(cardinality(p_tech_stack), 0) = 0
  or not exists (
    select 1
    from unnest(p_tech_stack) as requested(skill)
    where not exists (
      select 1
      from jsonb_array_elements_text(
        case
          when jsonb_typeof(p.skills_needed) = 'array'
          then p.skills_needed
          else '[]'::jsonb
        end
      ) as existing(skill)
      where lower(trim(existing.skill)) =
            lower(trim(requested.skill))
    )
  )
)

  order by
    -- Put the most relevant keyword matches first.
    case
      when nullif(trim(p_keyword), '') is null
      then 0
      else ts_rank(
        to_tsvector(
          'english',
          concat_ws(
            ' ',
            p.title,
            p.content,
            p.cause,
            p.skills_needed::text
          )
        ),
        plainto_tsquery(
          'english',
          trim(p_keyword)
        )
      )
    end desc,
    p.title asc,
    p.id asc

  limit least(greatest(coalesce(p_limit, 20), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- Allow the application's public and authenticated
-- Supabase clients to invoke this search RPC.
-- Existing RLS policies still apply.
revoke all on function public.search_projects(
  text, text, text[], integer, integer
) from public;

grant execute on function public.search_projects(
  text, text, text[], integer, integer
) to anon, authenticated;
