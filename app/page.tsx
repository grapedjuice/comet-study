import Link from "next/link";

export default function HomePage() {
  return (
    <main id="main" tabIndex={-1}>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="intro">A little structure. A few good classmates.</p>
          <h1 id="hero-title">Make time to learn together.</h1>
          <p className="hero-description">
            Your classes are better with a study group. Find classmates in the
            same course, agree on a time, and make showing up feel easy.
          </p>
          <div className="hero-actions">
            <Link className="button primary" href="/sign-in">
              Find my study group <span aria-hidden="true">→</span>
            </Link>
            <a className="text-link" href="#how-it-works">
              See how it works
            </a>
          </div>
          <div className="access-note">
            <span className="status-dot ready" aria-hidden="true" />
            <p>
              <strong>Built for UT Dallas students.</strong>
              <br />
              Use your university email to get started.
            </p>
          </div>
        </div>
        <div className="orbit-illustration" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orbit-center">
            <span>Same class.</span>
            <span>Shared momentum.</span>
          </div>
          <div className="orbit-note note-one">Find your people</div>
          <div className="orbit-note note-two">Make a plan</div>
          <div className="orbit-note note-three">Show up again</div>
          <span className="orbit-star star-one">✳</span>
          <span className="orbit-star star-two">✳</span>
        </div>
      </section>
      <section
        className="rhythm-section"
        id="how-it-works"
        aria-labelledby="rhythm-title"
      >
        <div className="section-intro">
          <h2 id="rhythm-title">Make it a weekly thing.</h2>
          <p>
            The plan for Comet Study is simple: less coordinating, more
            learning.
          </p>
        </div>
        <ol className="rhythm-list">
          <li>
            <span className="step-number" aria-hidden="true">
              1
            </span>
            <div>
              <h3>Start with your class</h3>
              <p>
                Find a small group working through the same course section, with
                study styles that fit yours.
              </p>
            </div>
          </li>
          <li>
            <span className="step-number" aria-hidden="true">
              2
            </span>
            <div>
              <h3>Agree on a time</h3>
              <p>
                Propose a session, find a weekly overlap, and choose a campus
                space with no known schedule conflict.
              </p>
            </div>
          </li>
          <li>
            <span className="step-number" aria-hidden="true">
              3
            </span>
            <div>
              <h3>Keep the momentum</h3>
              <p>
                Bring your notes, share useful resources, and keep the next
                session on the calendar.
              </p>
            </div>
          </li>
        </ol>
      </section>
      <section
        className="privacy-section"
        id="privacy"
        aria-labelledby="privacy-title"
      >
        <span className="privacy-symbol" aria-hidden="true">
          ↗
        </span>
        <div>
          <h2 id="privacy-title">Your schedule stays yours.</h2>
          <p>
            The privacy commitment: show why a group is a good fit without
            sharing your exact availability by default. Room suggestions will
            always explain their limits, and student-reported exam dates will
            stay clearly labeled.
          </p>
        </div>
      </section>
    </main>
  );
}
