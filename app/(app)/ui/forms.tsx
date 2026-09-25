"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  createContext,
  startTransition,
  useActionState,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ActionResult } from "../actions";

type Action = (
  prev: ActionResult | null,
  form: FormData,
) => Promise<ActionResult>;

const TOAST_EVENT = "comet:toast";

export function toast(result: { ok: boolean; text: string }) {
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: result }));
}

const Pending = createContext<{ pending: boolean; pressed: string | null }>({
  pending: false,
  pressed: null,
});

/**
 * A form bound to a server action: disables while pending and reports the
 * outcome as a toast. Results are handled as the action resolves, so the
 * toast still shows when success removes this form from the page. Fields are
 * kept on error (React's automatic form reset would wipe them) and only
 * cleared on success when asked.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  onSuccess,
  hidden,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onSuccess?: () => void;
  hidden?: Record<string, string>;
}) {
  const form = useRef<HTMLFormElement>(null);
  const after = useRef({ resetOnSuccess, onSuccess });
  useEffect(() => {
    after.current = { resetOnSuccess, onSuccess };
  });
  const [pressed, setPressed] = useState<string | null>(null);
  const [, run, pending] = useActionState(
    async (prev: ActionResult | null, data: FormData) => {
      const result = await action(prev, data);
      // A redirecting action navigates away and has no result to report.
      if (!result) return prev;
      if (result.ok) {
        if (result.message) toast({ ok: true, text: result.message });
        if (after.current.resetOnSuccess) form.current?.reset();
        after.current.onSuccess?.();
      } else toast({ ok: false, text: result.error });
      return result;
    },
    null,
  );
  return (
    <form
      ref={form}
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        const submitter = (event.nativeEvent as SubmitEvent)
          .submitter as HTMLButtonElement | null;
        const data = new FormData(event.currentTarget, submitter);
        setPressed(
          submitter?.name ? `${submitter.name}=${submitter.value}` : null,
        );
        startTransition(() => run(data));
      }}
    >
      {hidden &&
        Object.entries(hidden).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
      <Pending.Provider value={{ pending, pressed }}>
        {children}
      </Pending.Provider>
    </form>
  );
}

export function SubmitButton({
  children,
  pendingLabel,
  className = "button primary",
  name,
  value,
  disabled,
  title,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  name?: string;
  value?: string;
  disabled?: boolean;
  title?: string;
}) {
  const { pending, pressed } = useContext(Pending);
  // With several submit buttons, only the pressed one shows progress.
  const mine = pending && (!name || pressed === `${name}=${value}`);
  return (
    <button
      className={className}
      type="submit"
      name={name}
      value={value}
      disabled={pending || disabled}
      aria-busy={mine || undefined}
      title={title}
    >
      {mine && pendingLabel ? pendingLabel : children}
    </button>
  );
}

/** A destructive submit that asks once inline before it fires. */
export function ConfirmSubmit({
  children,
  confirmLabel = "Yes, do it",
  prompt = "Are you sure?",
  className = "button ghost danger",
}: {
  children: React.ReactNode;
  confirmLabel?: string;
  prompt?: string;
  className?: string;
}) {
  const [asking, setAsking] = useState(false);
  const { pending } = useContext(Pending);
  if (!asking)
    return (
      <button
        className={className}
        type="button"
        onClick={() => setAsking(true)}
      >
        {children}
      </button>
    );
  return (
    <span className="confirm-row" role="group" aria-label={prompt}>
      <span className="confirm-prompt">{prompt}</span>
      <button
        className="button danger-solid small"
        type="submit"
        disabled={pending}
      >
        {pending ? "Working…" : confirmLabel}
      </button>
      <button
        className="button ghost small"
        type="button"
        onClick={() => setAsking(false)}
      >
        Cancel
      </button>
    </span>
  );
}

export function Toaster() {
  const [toasts, setToasts] = useState<
    { id: number; ok: boolean; text: string }[]
  >([]);
  useEffect(() => {
    let id = 0;
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<{ ok: boolean; text: string }>)
        .detail;
      const next = { id: ++id, ...detail };
      setToasts((current) => [...current.slice(-2), next]);
      setTimeout(
        () => setToasts((current) => current.filter((t) => t.id !== next.id)),
        detail.ok ? 3600 : 6000,
      );
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, []);
  return (
    <div className="toaster" role="status" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.p
            key={t.id}
            className={`toast ${t.ok ? "ok" : "error"}`}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="toast-dot" aria-hidden="true" />
            {t.text}
          </motion.p>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Toggle chips backed by real checkboxes, so they submit with the form. */
export function ChipGroup({
  name,
  options,
  selected,
  legend,
}: {
  name: string;
  options: readonly { id: string; label: string }[];
  selected: string[];
  legend: string;
}) {
  return (
    <fieldset className="chip-group">
      <legend className="field-label">{legend}</legend>
      <div className="chips">
        {options.map((option) => (
          <label key={option.id} className="chip">
            <input
              type="checkbox"
              name={name}
              value={option.id}
              defaultChecked={selected.includes(option.id)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
