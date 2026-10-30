import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AT_COOKIE, RT_COOKIE } from "@/lib/auth/config";
import { refreshTokens } from "@/lib/auth/tokens";
import { proxy } from "@/proxy";

vi.mock("@/lib/auth/tokens", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/tokens")>()),
  refreshTokens: vi.fn(),
}));

const refreshMock = vi.mocked(refreshTokens);

const token = (expInSec: number) =>
  `h.${Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expInSec }),
  ).toString("base64url")}.s`;

const request = (
  path: string,
  cookies: Record<string, string>,
  method = "GET",
) =>
  new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: {
      cookie: Object.entries(cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join("; "),
    },
  });

// NextResponse.next({ request })로 다운스트림에 넘긴 요청 쿠키 헤더
const forwardedCookie = (res: Response) =>
  res.headers.get("x-middleware-request-cookie");

beforeEach(() => refreshMock.mockReset());

describe("proxy", () => {
  test("AT 만료까지 여유가 있으면 refresh 없이 통과한다", async () => {
    const res = await proxy(
      request("/dashboard", { [AT_COOKIE]: token(600), [RT_COOKIE]: "rt" }),
    );

    expect(refreshMock).not.toHaveBeenCalled();
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  test("AT가 만료 임박이면 refresh 후 응답 쿠키와 다운스트림 요청 쿠키를 모두 새 토큰으로 바꾼다", async () => {
    const newAt = token(600);
    refreshMock.mockResolvedValue({
      accessToken: newAt,
      refreshToken: "rt-new",
      accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 600,
      refreshTokenExpiresAt: Math.floor(Date.now() / 1000) + 3600,
    });

    const res = await proxy(
      request("/dashboard", { [AT_COOKIE]: token(10), [RT_COOKIE]: "rt-old" }),
    );

    expect(refreshMock).toHaveBeenCalledWith("rt-old");
    expect(res.cookies.get(AT_COOKIE)?.value).toBe(newAt);
    expect(res.cookies.get(RT_COOKIE)?.value).toBe("rt-new");
    expect(forwardedCookie(res)).toContain(`${RT_COOKIE}=rt-new`);
  });

  test("보호 경로 GET에서 refresh가 실패하면 쿠키를 지우고 /login?next=로 redirect한다", async () => {
    refreshMock.mockResolvedValue(null);

    const res = await proxy(
      request("/dashboard?tab=1", { [AT_COOKIE]: token(-10), [RT_COOKIE]: "rt" }),
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/login?next=%2Fdashboard%3Ftab%3D1",
    );
    expect(res.cookies.get(AT_COOKIE)?.value).toBe("");
  });

  test("Server Action(POST)에서 refresh가 실패하면 redirect하지 않고 통과시킨다", async () => {
    refreshMock.mockResolvedValue(null);

    const res = await proxy(
      request("/dashboard", { [RT_COOKIE]: "rt" }, "POST"),
    );

    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.cookies.get(RT_COOKIE)?.value).toBe("");
  });

  test("토큰이 없으면 보호 경로는 /login으로 redirect한다", async () => {
    const res = await proxy(request("/dashboard", {}));

    expect(res.status).toBe(307);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  test("토큰이 없어도 공개 경로는 통과한다", async () => {
    const res = await proxy(request("/", {}));

    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});
