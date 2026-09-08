import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRepository } from '../../../../workspaces/access';
import { getGrade, gradeHistory, gradeSummaries } from '../../../../db/queries/grade-runs';
import { readinessRubric } from '../../../../domain/grading/readiness-v01';
import { GradeCard } from '../../../../components/grading/grade-card';
import { GradeControls, GradeReport } from '../../../../components/grading/report';
export const dynamic = 'force-dynamic';
export default async function Grading({
  params,
  searchParams,
}: {
  params: Promise<{ repoId: string }>;
  searchParams: Promise<{ run?: string }>;
}) {
  const { repoId } = await params;
  const repo = await requireRepository(repoId);
  const { run } = await searchParams;
  const [summaries, history, selected] = await Promise.all([
    gradeSummaries([repoId]),
    gradeHistory(repoId),
    run ? getGrade(repoId, run) : Promise.resolve(null),
  ]);
  if (run && !selected) notFound();
  const summary = summaries[0];
  const grade = run ? selected : summary?.latest;
  const href = `/repos/${encodeURIComponent(repoId)}/grading`;
  return (
    <>
      <Link href={`/repos/${encodeURIComponent(repoId)}`}>
        ← {repo.owner}/{repo.name}
      </Link>
      <div className="eyebrow" style={{ marginTop: 28 }}>
        Repository / Readiness
      </div>
      <h1>A record of readiness.</h1>
      <p className="page-intro">Understand the foundations your agents build on.</p>
      <GradeControls
        key={repoId}
        repositoryId={repoId}
        initial={summary?.status ?? null}
        canRun={!repo.isDemo}
      />
      {run && (
        <p>
          Viewing a saved report. <Link href={href}>View latest completed report</Link>
        </p>
      )}
      <div className="grading-layout">
        <div>
          {grade?.score !== null && grade?.score !== undefined ? (
            <GradeCard
              score={grade.score}
              repositoryName={`${repo.owner} / ${repo.name}`}
              sha={grade.sha}
              rubricVersion={grade.rubricVersion}
            />
          ) : (
            <section className="grading-ungraded">
              <h2>Not graded yet.</h2>
              <p>
                A score appears only after all evidence is collected. Run the grader to create your
                first report.
              </p>
            </section>
          )}
          {history.length > 0 && (
            <details className="grading-history">
              <summary>Completed reports ({history.length})</summary>
              <ul>
                {history.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`${href}?run=${encodeURIComponent(item.id)}`}
                      aria-current={grade?.id === item.id ? 'page' : undefined}
                    >
                      {item.score} / 100 · {item.sha.slice(0, 7)} ·{' '}
                      {item.computedAt.toISOString().slice(0, 10)} · v{item.rubricVersion}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        {grade && (
          <GradeReport
            grade={grade}
            owner={repo.owner}
            name={repo.name}
            outdated={
              grade.rubricVersion !== readinessRubric.version ||
              grade.evaluatorVersion !== readinessRubric.evaluatorVersion
            }
          />
        )}
      </div>
    </>
  );
}
