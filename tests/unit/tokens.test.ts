import { describe, expect, test, vi } from "vitest";

import type { TokenPair } from "@/lib/auth/backend-api";
import { createRefresher } from "@/lib/auth/tokens";

const pair = (n: number): TokenPair => ({
  accessToken: `at-${n}`,
  refreshToken: `rt-${n}`,
  accessTokenExpiresAt: 0,
  refreshTokenExpiresAt: 0,
});

describe("createRefresher", () => {
  test("같은 RT로 동시에 5번 호출하면 백엔드는 1번만 호출되고 모두 같은 토큰을 반환한다", async () => {
    let n = 0;
    const call = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return pair(++n);
    });
    const refresh = createRefresher(call);

    const results = await Promise.all(
      Array.from({ length: 5 }, () => refresh("rt-0")),
    );

    expect(call).toHaveBeenCalledTimes(1);
    expect(new Set(results.map((r) => r?.accessToken))).toEqual(
      new Set(["at-1"]),
    );
  });

  test("grace 시간 안에 옛 RT로 다시 호출하면 백엔드 호출 없이 직전 토큰을 반환한다", async () => {
    const call = vi.fn(async () => pair(1));
    const refresh = createRefresher(call, 1_000);

    await refresh("rt-0");
    const again = await refresh("rt-0");

    expect(call).toHaveBeenCalledTimes(1);
    expect(again?.accessToken).toBe("at-1");
  });

  test("grace 시간이 지난 뒤 옛 RT로 호출하면 백엔드를 다시 호출한다", async () => {
    vi.useFakeTimers();
    const call = vi.fn(async () => pair(1));
    const refresh = createRefresher(call, 1_000);

    await refresh("rt-0");
    vi.advanceTimersByTime(1_001);
    await refresh("rt-0");

    expect(call).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  test("백엔드가 실패하면 null을 반환하고 다음 호출은 다시 백엔드를 호출한다", async () => {
    const call = vi
      .fn<(rt: string) => Promise<TokenPair | null>>()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(pair(1));
    const refresh = createRefresher(call);

    expect(await refresh("rt-0")).toBeNull();
    expect((await refresh("rt-0"))?.accessToken).toBe("at-1");
    expect(call).toHaveBeenCalledTimes(2);
  });

  test("서로 다른 RT는 각각 백엔드를 호출한다", async () => {
    const call = vi.fn(async (rt: string) => pair(Number(rt.slice(3))));
    const refresh = createRefresher(call);

    await Promise.all([refresh("rt-1"), refresh("rt-2")]);

    expect(call).toHaveBeenCalledTimes(2);
  });
});
