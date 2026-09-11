import { beforeEach, expect, test, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const deps = vi.hoisted(() => ({
  authorize: vi.fn(),
  summaries: vi.fn(),
  history: vi.fn(),
  get: vi.fn(),
  actEnabled: vi.fn(),
  fetchGrantedPermissions: vi.fn(),
}));
vi.mock('../../../../workspaces/access', () => ({ requireRepository: deps.authorize }));
vi.mock('../../../../db/queries/grade-runs', () => ({
  gradeSummaries: deps.summaries,
  gradeHistory: deps.history,
  getGrade: deps.get,
}));
vi.mock('../../../../db/queries/act-settings', () => ({ actEnabled: deps.actEnabled }));
vi.mock('../../../../github/installation-permissions', () => ({
  fetchGrantedPermissions: deps.fetchGrantedPermissions,
}));
vi.mock('../../../../components/grading/report', () => ({
  GradeControls: ({ initial }: { initial: { state: string } | null }) =>
    createElement('p', null, initial?.state),
  GradeReport: ({ grade }: { grade: { rubricVersion: string } }) =>
    createElement('p', null, grade.rubricVersion),
}));
import Grading from './page';
const completed = {
  id: 'old',
  score: 60,
  sha: 'a'.repeat(40),
  rubricVersion: '0.1.0',
  evaluatorVersion: '1.0.0',
  computedAt: new Date('2026-09-08'),
  checks: [],
};
const call = (run?: string) =>
  Grading({ params: Promise.resolve({ repoId: 'repo' }), searchParams: Promise.resolve({ run }) });
beforeEach(() => {
  vi.resetAllMocks();
  deps.authorize.mockResolvedValue({
    id: 'repo',
    owner: 'owner',
    name: 'repo',
    isDemo: false,
    installationId: 'installation-1',
  });
  deps.summaries.mockResolvedValue([{ latest: completed, status: { id: 'new', state: 'failed' } }]);
  deps.history.mockResolvedValue([completed]);
  deps.get.mockResolvedValue(null);
  deps.actEnabled.mockResolvedValue(false);
  deps.fetchGrantedPermissions.mockResolvedValue({ contents: null, pullRequests: null });
});
test('latest completed score remains visible alongside failed current attempt', async () => {
  const html = renderToStaticMarkup(await call());
  expect(html).toContain('60 out of 100');
  expect(html).toContain('failed');
});
test('historical selection is scoped to the authorized repository', async () => {
  deps.get.mockResolvedValue({ ...completed, score: 20, rubricVersion: '0.0.1' });
  const html = renderToStaticMarkup(await call('old'));
  expect(deps.get).toHaveBeenCalledWith('repo', 'old');
  expect(html).toContain('20 out of 100');
  expect(html).toContain('0.0.1');
  expect(html).toContain('Viewing a saved report');
});
test('missing or foreign historical run is not replaced by latest grade', async () => {
  await expect(call('foreign')).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
});
test('outsider fails before any grade read', async () => {
  deps.authorize.mockRejectedValue(new Error('denied'));
  await expect(call()).rejects.toThrow('denied');
  expect(deps.summaries).not.toHaveBeenCalled();
  expect(deps.history).not.toHaveBeenCalled();
});
test('incomplete evidence has an ungraded state with no numeric card', async () => {
  deps.summaries.mockResolvedValue([{ latest: null, status: { id: 'new', state: 'running' } }]);
  deps.history.mockResolvedValue([]);
  const html = renderToStaticMarkup(await call());
  expect(html).toContain('Not graded yet');
  expect(html).not.toContain('out of 100');
});

test('escaped route id is decoded before authorization', async () => {
  await Grading({
    params: Promise.resolve({ repoId: 'repository%3A1360100266' }),
    searchParams: Promise.resolve({}),
  });
  expect(deps.authorize).toHaveBeenCalledWith('repository:1360100266');
});
