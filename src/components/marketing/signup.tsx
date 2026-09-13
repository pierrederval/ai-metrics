export function Signup() {
  return (
    <section className="mk-section mk-signup" id="self-host">
      <p className="eyebrow">Get your grade</p>
      <h2>Find out what your agents are working with.</h2>
      <p className="mk-lede">
        Connect a repository and fieldnote reconstructs its pull-request and CI history, then
        grades the repository itself. The first card takes as long as the import does.
      </p>
      <div className="mk-cta">
        <a className="fn-button fn-button-lg" href="/api/auth/login">
          Continue with GitHub
        </a>
      </div>
      <p className="mk-footnote">
        Or run it yourself. fieldnote is AGPL-3.0: the whole thing is in the repository, including
        the grader, the rubric and the seeded demo — no GitHub App required to try it.
      </p>
    </section>
  );
}
