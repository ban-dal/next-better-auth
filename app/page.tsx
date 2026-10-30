import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">better-auth × 백엔드 JWT PoC</h1>
      <nav className="flex gap-4 underline">
        <Link href="/login">로그인</Link>
        <Link href="/dashboard">대시보드</Link>
      </nav>
    </main>
  );
}
