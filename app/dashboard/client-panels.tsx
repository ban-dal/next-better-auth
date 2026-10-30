"use client";

import { useState, useTransition } from "react";
import { authClient } from "@/lib/auth/auth-client";
import { callBackendAction } from "./actions";

export function ActionPanel() {
  const [result, setResult] = useState<string>();
  const [pending, startTransition] = useTransition();

  return (
    <section className="flex flex-col gap-2 rounded border p-4">
      <h2 className="font-medium">Server Action → 백엔드</h2>
      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const data = await callBackendAction();
            setResult(`${data.name} @ ${data.servedAt}`);
          })
        }
        className="w-fit rounded bg-black px-3 py-1.5 text-white disabled:opacity-50"
      >
        /me 호출
      </button>
      {result && <code className="text-sm">{result}</code>}
    </section>
  );
}

export function ClientSession() {
  const { data, isPending } = authClient.useSession();

  return (
    <section className="flex flex-col gap-2 rounded border p-4">
      <h2 className="font-medium">authClient.useSession()</h2>
      <code className="text-sm">
        {isPending
          ? "loading…"
          : data
            ? `${data.user.email} · AT 만료 ${new Date(data.session.expiresAt).toLocaleTimeString()}`
            : "세션 없음"}
      </code>
    </section>
  );
}
