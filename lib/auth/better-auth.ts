import "server-only";
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import * as z from "zod";
import { backendApi } from "./backend-api";
import { AT_COOKIE, RT_COOKIE } from "./config";
import {
  authCookieEntries,
  sessionFromClaims,
  verifyAccessToken,
} from "./tokens";

// 백엔드가 발급한 AT/RT를 그대로 쓰는 better-auth 플러그인.
// 코어의 signInEmail / signOut / getSession을 같은 키로 덮어써서 authClient.signIn.email(),
// authClient.signOut(), authClient.useSession()을 그대로 쓸 수 있게 한다.
// better-auth 자체 세션(DB, 세션 쿠키)은 쓰지 않는다. 토큰 갱신은 proxy와 tokens.ts가 담당한다.
const ALLOWED_PATHS = new Set(["/sign-in/email", "/sign-out", "/get-session"]);

const backendJwt = () =>
  ({
    id: "backend-jwt",
    endpoints: {
      signInEmail: createAuthEndpoint(
        "/sign-in/email",
        {
          method: "POST",
          body: z.object({ email: z.string(), password: z.string() }),
        },
        async (ctx) => {
          const pair = await backendApi.login(ctx.body.email, ctx.body.password);
          if (!pair) {
            throw new APIError("UNAUTHORIZED", {
              message: "이메일 또는 비밀번호가 올바르지 않습니다.",
            });
          }
          for (const { name, value, options } of authCookieEntries(pair)) {
            ctx.setCookie(name, value, options);
          }
          const claims = await verifyAccessToken(pair.accessToken);
          return ctx.json(claims ? sessionFromClaims(claims) : null);
        },
      ),

      signOut: createAuthEndpoint(
        "/sign-out",
        { method: "POST" },
        async (ctx) => {
          const refreshToken = ctx.getCookie(RT_COOKIE);
          if (refreshToken) await backendApi.logout(refreshToken);
          for (const name of [AT_COOKIE, RT_COOKIE]) {
            ctx.setCookie(name, "", { path: "/", maxAge: 0 });
          }
          return ctx.json({ success: true });
        },
      ),

      getSession: createAuthEndpoint(
        "/get-session",
        { method: "GET" },
        async (ctx) => {
          const token = ctx.getCookie(AT_COOKIE);
          const claims = token ? await verifyAccessToken(token) : null;
          return ctx.json(claims ? sessionFromClaims(claims) : null);
        },
      ),
    },

    // 코어 엔드포인트는 DB를 전제하므로 HTTP로는 위 3개만 열어 둔다 (허용 목록).
    // disabledPaths는 정확히 일치하는 경로만 막아서 동적 경로나 버전업으로 추가된 경로가 새어 나간다.
    onRequest: async (request, ctx) => {
      const basePath = ctx.options.basePath ?? "/api/auth";
      const path = new URL(request.url).pathname
        .slice(basePath.length)
        .replace(/\/+$/, "");
      if (!ALLOWED_PATHS.has(path)) {
        return { response: new Response("Not Found", { status: 404 }) };
      }
    },
  }) satisfies BetterAuthPlugin;

// DB 없이 동작한다. 사용자·세션의 원천은 백엔드 JWT이고, better-auth는 엔드포인트와 클라이언트 SDK만 제공한다.
export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secret:
    process.env.BETTER_AUTH_SECRET ?? "dev-only-better-auth-secret-change-me",
  // nextCookies는 Server Action에서 auth.api 호출 시 Set-Cookie를 cookies()로 옮겨 준다. 반드시 마지막에 둔다.
  plugins: [backendJwt(), nextCookies()],
});
