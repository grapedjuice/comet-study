"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="button ghost"
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/v1/auth/sign-out", { method: "POST" }).catch(
          () => undefined,
        );
        router.replace("/");
        router.refresh();
      }}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
