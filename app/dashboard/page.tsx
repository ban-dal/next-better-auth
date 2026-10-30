import { Suspense } from "react";
import { requireSession, rscFetch } from "@/lib/auth/server";
import { signOutAction } from "./actions";
import { ActionPanel, ClientSession } from "./client-panels";

export default function DashboardPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <Suspense fallback={<p>세션 확인 중…</p>}>
        <Profile />
      </Suspense>
      <ActionPanel />
      <ClientSession />
      <form action={signOutAction}>
        <button className="rounded border px-3 py-1.5">로그아웃</button>
      </form>
    </main>
  );
}

async function Profile() {
  const session = await requireSession();
  const me = (await (await rscFetch("/me")).json()) as { servedAt: string };

  return (
    <section className="flex flex-col gap-1 rounded border p-4">
      <h2 className="font-medium">RSC → 백엔드</h2>
      <p>{session.user.name} ({session.user.email})</p>
      <code className="text-sm">
        AT 만료 {session.session.expiresAt.toLocaleTimeString()} · /me{" "}
        {me.servedAt}
      </code>
    </section>
  );
}
