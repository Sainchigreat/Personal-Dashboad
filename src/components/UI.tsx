import {
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { ArrowRight, Check, X, type LucideIcon } from "lucide-react";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`logo ${compact ? "logo-compact" : ""}`}
      aria-label="Momentum OS"
    >
      <span className="logo-mark">
        <svg
          width="21"
          height="21"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M4.5 17.5V6.5L11.8 13.4L19.5 6.5V17.5"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M4.5 17.5L11.8 10.8L19.5 17.5"
            stroke="currentColor"
            strokeOpacity=".48"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {!compact && (
        <span className="logo-name">
          momentum<span>OS</span>
        </span>
      )}
    </div>
  );
}
export function Button({
  children,
  variant = "secondary",
  icon: Icon,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  icon?: LucideIcon;
}) {
  return (
    <button className={`button ${variant} ${className}`} {...props}>
      {Icon && <Icon size={15} strokeWidth={1.8} />}
      <span>{children}</span>
    </button>
  );
}
export function IconButton({
  icon: Icon,
  label,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon;
  label: string;
}) {
  return (
    <button
      className={`icon-button ${className}`}
      title={label}
      aria-label={label}
      {...props}
    >
      <Icon size={16} strokeWidth={1.7} />
    </button>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}
export function SectionHeading({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {action}
    </div>
  );
}
export function TextLink({
  children,
  onClick,
  arrow = true,
}: {
  children: ReactNode;
  onClick: () => void;
  arrow?: boolean;
}) {
  return (
    <button className="text-link" onClick={onClick}>
      {children}
      {arrow && <ArrowRight size={14} />}
    </button>
  );
}
export function Progress({
  value,
  className = "",
  color = "accent",
  label = "Progress",
}: {
  value: number;
  className?: string;
  color?: string;
  label?: string;
}) {
  return (
    <div
      className={`progress-track ${className}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.max(0, Math.min(100, value))}
    >
      <div
        className={`progress-fill ${color}`}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}
export function Pill({
  children,
  tone = "neutral",
  dot = false,
}: {
  children: ReactNode;
  tone?: string;
  dot?: boolean;
}) {
  return (
    <span className={`pill ${tone}`}>
      {dot && <span className="pill-dot" />}
      {children}
    </span>
  );
}
export function Status({ value }: { value: string }) {
  const lower = value.toLowerCase();
  const tone = [
    "paid",
    "done",
    "completed",
    "published",
    "distributed",
    "approved",
    "won",
    "ready",
  ].includes(lower)
    ? "green"
    : [
          "pending",
          "review",
          "in progress",
          "in_progress",
          "warm",
          "planning",
          "draft",
          "researching",
        ].includes(lower)
      ? "amber"
      : ["refunded", "lost", "cancelled", "not interested"].includes(lower)
        ? "muted"
        : "accent";
  return (
    <Pill tone={tone} dot>
      {value.replaceAll("_", " ")}
    </Pill>
  );
}
export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon size={19} strokeWidth={1.6} />
      </div>
      <strong>{title}</strong>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function Tabs({
  tabs,
  selected,
  onChange,
}: {
  tabs: Array<{ id: string; label: string; count?: number }>;
  selected: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={selected === tab.id}
          className={selected === tab.id ? "active" : ""}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.count !== undefined && <span>{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}
export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={checked}
      className={`check-control ${checked ? "checked" : ""}`}
      onClick={onChange}
    >
      {checked && <Check size={12} strokeWidth={2.6} />}
    </button>
  );
}
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", listener);
    const timer = window.setTimeout(
      () =>
        ref.current
          ?.querySelector<HTMLInputElement>(
            "input:not([type=hidden]), textarea, select",
          )
          ?.focus(),
      40,
    );
    return () => {
      window.removeEventListener("keydown", listener);
      window.clearTimeout(timer);
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`modal ${wide ? "modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-heading"
      >
        <div className="modal-heading">
          <div>
            <h2 id="modal-heading">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <IconButton icon={X} label="Close dialog" onClick={onClose} />
        </div>
        {children}
      </div>
    </div>
  );
}
export function MetricCard({
  icon: Icon,
  iconTone = "accent",
  label,
  value,
  detail,
  progress,
  onClick,
}: {
  icon: LucideIcon;
  iconTone?: string;
  label: string;
  value: ReactNode;
  detail: ReactNode;
  progress?: number;
  onClick?: () => void;
}) {
  return (
    <div
      className={`metric-card ${onClick ? "metric-clickable" : ""}`}
      onClick={onClick}
      onKeyDown={(event) => {
        if (onClick && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onClick();
        }
      }}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="metric-top">
        <span className={`metric-icon ${iconTone}`}>
          <Icon size={17} strokeWidth={1.7} />
        </span>
        <span className="metric-label">{label}</span>
        {onClick && <ArrowRight className="metric-arrow" size={14} />}
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-detail">{detail}</div>
      {progress !== undefined && <Progress value={progress} color={iconTone} />}
    </div>
  );
}
