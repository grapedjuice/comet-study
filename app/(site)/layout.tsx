import Link from "next/link";
import SiteHeader from "../ui/site-header";

export default function SiteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <SiteHeader />
      {children}
      <footer className="site-footer">
        <div className="footer-inner">
          <p className="footer-brand">
            A little company. <em>A lot of possibility.</em>
          </p>
          <div className="footer-links">
            <Link href="/#how-it-works">How it works</Link>
            <Link className="footer-privacy" href="/#privacy">
              Privacy approach
            </Link>
            <Link href="/sign-in">Sign in</Link>
          </div>
          <p className="footer-note">
            Independent student project. Not an official UT Dallas service.
          </p>
        </div>
      </footer>
    </>
  );
}
