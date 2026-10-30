import { BACKEND_URL } from "./config";

// 백엔드 HTTP 호출은 모두 이 파일을 거친다.

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
};

function post(path: string, body: unknown) {
  return fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
}

export const backendApi = {
  async login(email: string, password: string): Promise<TokenPair | null> {
    const res = await post("/auth/login", { email, password });
    return res.ok ? res.json() : null;
  },

  async refresh(refreshToken: string): Promise<TokenPair | null> {
    const res = await post("/auth/refresh", { refreshToken });
    return res.ok ? res.json() : null;
  },

  async logout(refreshToken: string) {
    await post("/auth/logout", { refreshToken }).catch(() => undefined);
  },

  request(path: string, accessToken: string, init?: RequestInit) {
    return fetch(`${BACKEND_URL}${path}`, {
      ...init,
      headers: { ...init?.headers, authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
  },
};
