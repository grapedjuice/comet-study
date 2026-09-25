import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="not-found" tabIndex={-1}>
      <p className="intro">404 · Lost in orbit</p>
      <h1>
        This page <em className="gradient-serif">isn’t here.</em>
      </h1>
      <p>
        The link may have changed. Head back to the home page to find your way.
      </p>
      <Link className="button primary" href="/">
        Back to Comet Study
      </Link>
    </main>
  );
}
