import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mount, json } from './helpers/components.mjs';

test('volunteers see recommended projects with match reasons from the recommendation RPC', async (t) => {
  const ui = mount(t, 'components/projects/RecommendedProjects.tsx', {
    auth: { user: { id: 'volunteer' }, role: 'volunteer', loading: false },
    fetch: (request) => {
      if (request.url.pathname.endsWith('/recommend_projects')) {
        return json([{
          id: 'project-1',
          title: 'Education site',
          organization_name: 'Helpful Org',
          status: 'Active',
          cause: 'Education',
          skills_needed: ['React'],
          created_at: '2026-02-01T00:00:00Z',
          score: 70,
          cause_score: 50,
          skill_score: 20,
          peer_score: 0,
          reasons: ['Matches your interest in Education', 'Shares 1 of your skills (react)'],
          ranking_mode: 'personalized',
        }]);
      }
      if (request.url.pathname.endsWith('/get_my_recommendation_signals')) {
        return json([{
          volunteer_id: 'volunteer',
          interests: ['Education'],
          skills: ['react'],
          pending_application_count: 0,
          approved_participation_count: 0,
          has_interests: true,
          has_skills: true,
          cold_start: false,
        }]);
      }
      return json([]);
    },
  });
  await ui.settle();
  assert.match(ui.text(), /Recommended for you/);
  assert.match(ui.text(), /Education site/);
  assert.match(ui.text(), /Matches your interest in Education/);
  assert.match(ui.text(), /Shares 1 of your skills/);
});

test('cold-start guidance links volunteers to their profile', async (t) => {
  const ui = mount(t, 'components/projects/RecommendedProjects.tsx', {
    auth: { user: { id: 'volunteer' }, role: 'volunteer', loading: false },
    fetch: (request) => {
      if (request.url.pathname.endsWith('/recommend_projects')) {
        return json([{
          id: 'project-2',
          title: 'General listing',
          organization_name: 'Org',
          status: 'Active',
          cause: 'Health',
          skills_needed: [],
          created_at: '2026-02-01T00:00:00Z',
          score: 0,
          cause_score: 0,
          skill_score: 0,
          peer_score: 0,
          reasons: ['Active opportunity — add skills and interests on your profile for better matches'],
          ranking_mode: 'cold_start',
        }]);
      }
      if (request.url.pathname.endsWith('/get_my_recommendation_signals')) {
        return json([{
          volunteer_id: 'volunteer',
          interests: [],
          skills: [],
          pending_application_count: 0,
          approved_participation_count: 0,
          has_interests: false,
          has_skills: false,
          cold_start: true,
        }]);
      }
      return json([]);
    },
  });
  await ui.settle();
  assert.match(ui.text(), /add skills and cause interests/i);
  const profileLink = ui.find((node) => node.type === 'Link' && node.props.href === '/volunteer/profile');
  assert.ok(profileLink);
});
