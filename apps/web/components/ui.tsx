import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
  size?: "md" | "sm";
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        "btn ui-btn",
        variant === "primary" && "primary",
        variant === "ghost" && "ghost",
        variant === "danger" && "danger",
        size === "sm" && "small",
        className,
      )}
      {...props}
    />
  );
});

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx("ui-input", className)} {...props} />;
}

export function Card({ className, children, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section className={cx("card", className)} {...props}>
      {children}
    </section>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "warn" | "ok" | "danger";
  className?: string;
}) {
  return <span className={cx("badge", tone !== "neutral" && tone, className)}>{children}</span>;
}

export function Alert({ kind = "error", children }: { kind?: "error" | "ok" | "info"; children: ReactNode }) {
  return (
    <p className={cx("alert", kind)} role={kind === "error" ? "alert" : "status"}>
      {children}
    </p>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field ui-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function PageHeader({ title, lede, action }: { title: string; lede?: string; action?: ReactNode }) {
  return (
    <header className="page-head">
      <div className="stack tight">
        <h1>{title}</h1>
        {lede ? <p className="muted page-lede">{lede}</p> : null}
      </div>
      {action ? <div className="page-action">{action}</div> : null}
    </header>
  );
}

export function PublicFrame({ children }: { children: ReactNode }) {
  return (
    <main className="public-wrap">
      <Link className="brand" href="/">
        ExpenseWise
      </Link>
      {children}
    </main>
  );
}
