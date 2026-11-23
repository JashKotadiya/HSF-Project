# Deterministic matching algorithm (#109)

This project matches **volunteers to Active project listings**, not exclusive one-to-one pairs. Many volunteers can apply to the same project, and organizations do not store ranked preference lists for applicants. For that reason the matcher is a **weighted multi-signal relevance ranker**, not Gale–Shapley / stable marriage, and not embeddings (see #94).

## Why this algorithm

| Option | Fit for HSF |
| --- | --- |
| Weighted cause + skill + peer participation (chosen) | Uses data we already store, explainable reasons, deterministic ties, works with sparse cohorts |
| Gale–Shapley | Needs both sides to rank each other and produces exclusive pairs — wrong shape for open applications |
| Pure collaborative filtering | Too sparse early on; hard to explain; risks leaking peer identity |
| Embeddings / semantic search | Explicitly out of scope for #94 |

## Signals

| Signal | Source | Notes |
| --- | --- | --- |
| Interests / cause | `volunteer_interests` ↔ `posts.cause` | Shared `cause_categories` taxonomy |
| Skills | `profiles.technical_skills` ↔ `posts.skills_needed` | Case-insensitive labels; Jaccard overlap |
| Confirmed participation | `applications.status = 'approved'` | Pending applications are history of intent, not work performed |
| Eligibility | Active listings only; exclude projects the caller already applied to | Draft/Closed never recommended |

Absent completion / milestone data is not invented. Peer boosts use **aggregates only** (never bios, resumes, emails, or identities).

## Scoring (0–100)

```
cause_score = 50 if project.cause is one of the caller's interests else 0
skill_score = 40 * Jaccard(caller skills, project skills)
peer_score  = 10 if ≥ 3 similar volunteers have an approved application on the project else 0
total       = cause_score + skill_score + peer_score
```

Similar volunteer: shares at least one interest cause, **or** skill Jaccard ≥ 0.25.

Tie-break (stable): `total DESC`, `created_at DESC`, `id ASC`.

## Ranking modes and reasons

- `personalized` — at least one of cause / skill / peer contributed
- `cold_start` — caller has no saved interests and no skills; Active listings returned with guidance to complete the profile
- `general` — caller has signals, but this listing scored 0; still eligible, ordered after scored matches

Reasons are honest: peer wording appears only when `peer_score > 0`.

## RPCs

- `get_my_recommendation_signals()` — caller's own interests, skills, and application counts (#93)
- `recommend_projects(p_limit, p_offset)` — ranked rows with scores and reasons (#94 / #109)

Ordinary `search_projects` browsing stays independent.

## Apply

Run [`supabase/recommend_projects.sql`](../supabase/recommend_projects.sql) in the Supabase SQL Editor after `interests.sql` and `applications` / `posts` exist.
