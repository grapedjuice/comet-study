import Link from "next/link";
import { initials } from "@/lib/app-errors";
import { Icon, type IconName } from "./icons";

export function PageHeader({
  kicker,
  title,
  accent,
  children,
  actions,
}: {
  kicker: string;
  title: string;
  accent?: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="page-head">
      <div>
        <p className="section-kicker">{kicker}</p>
        <h1>
          {title} {accent ? <em className="gradient-serif">{accent}</em> : null}
        </h1>
        {children ? <div className="page-lede">{children}</div> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function Panel({
  title,
  icon,
  action,
  children,
  className,
  id,
}: {
  title?: string;
  icon?: IconName;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      className={`panel${className ? ` ${className}` : ""}`}
      aria-labelledby={title && id ? `${id}-title` : undefined}
      id={id}
    >
      {title ? (
        <div className="panel-head">
          <h2 id={id ? `${id}-title` : undefined}>
            {icon ? <Icon name={icon} size={18} /> : null}
            {title}
          </h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  action?: { href: string; label: string };
}) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children ? <p className="empty-body">{children}</p> : null}
      {action ? (
        <Link className="button ghost small" href={action.href}>
          {action.label} <span aria-hidden="true">→</span>
        </Link>
      ) : null}
    </div>
  );
}

export function Avatars({
  names,
  total,
  max = 4,
}: {
  names: string[];
  total?: number;
  max?: number;
}) {
  const extra = (total ?? names.length) - Math.min(names.length, max);
  return (
    <span
      className="avatars"
      role="img"
      aria-label={`${total ?? names.length} members`}
    >
      {names.slice(0, max).map((name, index) => (
        <span
          key={`${name}-${index}`}
          className={`avatar tone-${index % 4}`}
          title={name}
          aria-hidden="true"
        >
          {initials(name)}
        </span>
      ))}
      {extra > 0 ? (
        <span className="avatar avatar-more" aria-hidden="true">
          +{extra}
        </span>
      ) : null}
    </span>
  );
}

export function Seats({
  count,
  capacity,
}: {
  count: number;
  capacity: number;
}) {
  return (
    <span
      className="seats"
      role="img"
      aria-label={`${count} of ${capacity} seats filled`}
    >
      {Array.from({ length: capacity }, (_, i) => (
        <i key={i} className={i < count ? "filled" : ""} />
      ))}
    </span>
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "good" | "warn" | "info" | "danger";
  children: React.ReactNode;
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function CourseTag({ code }: { code: string }) {
  return <span className="course-tag">{code}</span>;
}
