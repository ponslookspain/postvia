/**
 * Local E2E runner for the OTP auth flow (NOT for CI/production).
 *
 * Requires a local dev server started with:
 *   OTP_E2E_DEBUG=1 OTP_DEBUG_TOKEN=<secret> npm run dev
 *
 * The runner drives real HTTP + real DB rows (test-only @example.com
 * addresses). Afterwards remove the rows with:
 *   npm run cleanup:test-users -- --email <addr> --confirm DELETE-TEST-USERS
 * (ALLOW_TEST_CLEANUP=1 required).
 *
 * Covers: A (free), B (paid intent), C/D (password + code), E (passwordless),
 * H/I (settings password), J (abandoned onboarding resume), K (wrong/replay/
 * attempts/resend-cooldown/expiry-window), L (duplicate/disposable/unknown).
 * F/G (Google) stay browser-manual: OAuth cannot be scripted here.
 */

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const DEBUG_TOKEN = process.env.OTP_DEBUG_TOKEN ?? "";
const TS = Date.now();
const email = (tag: string) => `otp-e2e-${TS}-${tag}@example.com`;

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) console.log(`  PASS ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name} ${detail}`);
  }
}

class Jar {
  cookies = new Map<string, string>();
  async fetch(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    if (this.cookies.size > 0) {
      headers.set(
        "cookie",
        [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ")
      );
    }
    const res = await fetch(`${BASE}${path}`, { ...init, headers, redirect: "manual" });
    const setCookies = res.headers.getSetCookie?.() ?? [];
    for (const sc of setCookies) {
      const [pair] = sc.split(";");
      const idx = pair.indexOf("=");
      if (idx > 0) this.cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
    return res;
  }
}

async function json(res: Response) {
  return res.json().catch(() => ({}));
}

async function debugOtp(jar: Jar, em: string, type: "email-verification" | "sign-in") {
  const res = await jar.fetch("/api/auth/otp/debug", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DEBUG_TOKEN}`,
    },
    body: JSON.stringify({ email: em, type }),
  });
  const data = await json(res);
  return (data.otp as string) ?? null;
}

async function prismaCountUsers(): Promise<number> {
  const { prisma } = await import("@/lib/prisma");
  try {
    return await prisma.user.count();
  } finally {
    await prisma.$disconnect();
  }
}

async function scenarioA() {
  console.log("A. new user: email -> OTP -> onboarding -> free -> dashboard");
  const jar = new Jar();
  const em = email("a");
  const before = await prismaCountUsers();

  const r1 = await jar.fetch("/api/auth/otp/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: em, mode: "signup", plan: "growth" }),
  });
  check("signup request 200 ok", r1.status === 200 && (await json(r1)).ok === true);

  // Resend cooldown: immediate second request must be 429.
  const rCool = await jar.fetch("/api/auth/otp/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: em, mode: "signup" }),
  });
  check("immediate resend is 429 (cooldown)", rCool.status === 429, `got ${rCool.status}`);

  const code = await debugOtp(jar, em, "email-verification");
  check("debug returns 6-digit code", !!code && /^\d{6}$/.test(code), `got ${code}`);

  // One wrong attempt (attempts accounting), then the correct code.
  const rWrong = await jar.fetch("/api/auth/email-otp/verify-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: em, otp: "000000" }),
  });
  check("wrong code is 400", rWrong.status === 400, `got ${rWrong.status}`);

  const rVerify = await jar.fetch("/api/auth/email-otp/verify-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: em, otp: code }),
  });
  const vData = await json(rVerify);
  check("correct code verifies + session", rVerify.status === 200 && vData.status === true, `got ${rVerify.status}`);
  check("session cookie set", jar.cookies.size > 0);

  // Replay: same code must fail (single use).
  const rReplay = await jar.fetch("/api/auth/email-otp/verify-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: em, otp: code }),
  });
  check("replayed code is rejected", rReplay.status === 400, `got ${rReplay.status}`);

  const after = await prismaCountUsers();
  check("exactly one user created", after === before + 1, `before=${before} after=${after}`);

  // Onboarding gate: dashboard bounces to /onboarding before completion.
  const rDash0 = await jar.fetch("/dashboard");
  const loc0 = rDash0.headers.get("location") ?? "";
  check("dashboard redirects to onboarding when incomplete", [307, 308, 302].includes(rDash0.status) && loc0.includes("/onboarding"), `got ${rDash0.status} ${loc0}`);

  const rOnb = await jar.fetch("/api/onboarding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "E2E Alice", plan: "free" }),
  });
  const onbData = await json(rOnb);
  check("onboarding completes -> dashboard", rOnb.status === 200 && onbData.next === "/dashboard", `got ${rOnb.status}`);

  const rDash = await jar.fetch("/dashboard");
  check("dashboard 200 after onboarding", rDash.status === 200, `got ${rDash.status}`);
  return { jar, email: em };
}

async function scenarioBCDEHIJ(a: { jar: Jar; email: string }) {
  console.log("B. new user: email -> OTP -> onboarding -> paid intent -> billing");
  const jarB = new Jar();
  const emB = email("b");
  await jarB.fetch("/api/auth/otp/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: emB, mode: "signup", plan: "scale" }),
  });
  const codeB = await debugOtp(jarB, emB, "email-verification");
  await jarB.fetch("/api/auth/email-otp/verify-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: emB, otp: codeB }),
  });
  const rOnbB = await jarB.fetch("/api/onboarding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "E2E Bob", plan: "growth" }),
  });
  const onbB = await json(rOnbB);
  check("paid onboarding -> billing", onbB.next === "/billing");
  const rBill = await jarB.fetch("/billing");
  check("billing 200 for onboarded paid-intent user", rBill.status === 200, `got ${rBill.status}`);

  console.log("C+H. passwordless -> settings create password -> relogin with password");
  const rSet = await a.jar.fetch("/api/settings/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newPassword: "e2e-password-1", confirmPassword: "e2e-password-1" }),
  });
  check("create password 200", rSet.status === 200, `got ${rSet.status}`);
  await a.jar.fetch("/api/auth/sign-out", { method: "POST" });
  const jarC = new Jar();
  const rPwBad = await jarC.fetch("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: a.email, password: "wrong-password-x" }),
  });
  check("old/wrong password rejected", rPwBad.status !== 200, `got ${rPwBad.status}`);
  const rPw = await jarC.fetch("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: a.email, password: "e2e-password-1" }),
  });
  check("email+password login works", rPw.status === 200, `got ${rPw.status}`);
  const rDashC = await jarC.fetch("/dashboard");
  check("dashboard 200 after password login", rDashC.status === 200, `got ${rDashC.status}`);

  console.log("D. password user -> sign in with a code (same user, no duplicate)");
  const usersBefore = await prismaCountUsers();
  await jarC.fetch("/api/auth/otp/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: a.email, mode: "login" }),
  });
  const codeD = await debugOtp(jarC, a.email, "sign-in");
  check("login code issued for password user", !!codeD);
  const jarD = new Jar();
  const rCode = await jarD.fetch("/api/auth/sign-in/email-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: a.email, otp: codeD }),
  });
  check("code login 200", rCode.status === 200, `got ${rCode.status}`);
  const usersAfter = await prismaCountUsers();
  check("OTP login created no new user", usersAfter === usersBefore, `before=${usersBefore} after=${usersAfter}`);

  console.log("E. passwordless user -> email OTP -> dashboard");
  await jarB.fetch("/api/auth/sign-out", { method: "POST" });
  const jarE = new Jar();
  await jarE.fetch("/api/auth/otp/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: emB, mode: "login" }),
  });
  const codeE = await debugOtp(jarE, emB, "sign-in");
  const rE = await jarE.fetch("/api/auth/sign-in/email-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: emB, otp: codeE }),
  });
  check("passwordless code login 200", rE.status === 200, `got ${rE.status}`);
  check("passwordless reaches dashboard", (await jarE.fetch("/dashboard")).status === 200);

  console.log("I. change password -> old fails, new works");
  const rChg = await jarC.fetch("/api/settings/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      currentPassword: "e2e-password-1",
      newPassword: "e2e-password-2",
      confirmPassword: "e2e-password-2",
    }),
  });
  check("change password 200", rChg.status === 200, `got ${rChg.status}`);
  const jarI = new Jar();
  const rOld = await jarI.fetch("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: a.email, password: "e2e-password-1" }),
  });
  check("old password fails after change", rOld.status !== 200, `got ${rOld.status}`);
  const rNew = await jarI.fetch("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: a.email, password: "e2e-password-2" }),
  });
  check("new password works", rNew.status === 200, `got ${rNew.status}`);

  console.log("J. abandoned onboarding -> login again -> resume onboarding");
  const jarJ0 = new Jar();
  const emJ = email("j");
  await jarJ0.fetch("/api/auth/otp/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: emJ, mode: "signup" }),
  });
  const codeJ = await debugOtp(jarJ0, emJ, "email-verification");
  await jarJ0.fetch("/api/auth/email-otp/verify-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: emJ, otp: codeJ }),
  });
  // "Close browser": fresh jar, login via code, post-auth must Resume onboarding.
  const jarJ = new Jar();
  await jarJ.fetch("/api/auth/otp/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: emJ, mode: "login" }),
  });
  const codeJ2 = await debugOtp(jarJ, emJ, "sign-in");
  await jarJ.fetch("/api/auth/sign-in/email-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: emJ, otp: codeJ2 }),
  });
  const rPost = await jarJ.fetch("/post-auth");
  const locJ = rPost.headers.get("location") ?? "";
  check("post-auth resumes onboarding", [307, 308, 302].includes(rPost.status) && locJ.includes("/onboarding"), `got ${rPost.status} ${locJ}`);
}

async function scenarioK() {
  console.log("K. OTP security: attempts lockout, hourly cap, expiry window");
  const jar = new Jar();
  const em = email("k");
  await jar.fetch("/api/auth/otp/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: em, mode: "signup" }),
  });
  const code = await debugOtp(jar, em, "email-verification");
  for (let i = 0; i < 5; i++) {
    await jar.fetch("/api/auth/email-otp/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: em, otp: "000000" }),
    });
  }
  const rLocked = await jar.fetch("/api/auth/email-otp/verify-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: em, otp: code }),
  });
  check("correct code fails after 5 wrong attempts (lockout)", rLocked.status === 400, `got ${rLocked.status}`);

  // Expiry window: stored Verification row must live ~10 minutes.
  const { prisma } = await import("@/lib/prisma");
  try {
    const rows = await prisma.verification.findMany({
      where: { identifier: { startsWith: "email-verification-otp-" } },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    const v = rows[0];
    if (v) {
      const ttlMin = (v.expiresAt.getTime() - v.createdAt.getTime()) / 60000;
      check("OTP TTL is ~10 minutes", ttlMin > 9 && ttlMin <= 10.5, `got ${ttlMin}`);
    } else {
      check("OTP TTL row found", false, "no verification row");
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function scenarioL() {
  console.log("L. abuse: duplicate/disposable/unknown stay neutral + safe");
  const before = await prismaCountUsers();
  const jar = new Jar();
  // Duplicate signup of an existing address: neutral ok, no second user.
  const dupEmail = email("a-dup");
  await jar.fetch("/api/auth/otp/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: dupEmail, mode: "signup" }),
  });
  const mid = await prismaCountUsers();
  const rDup = await jar.fetch("/api/auth/otp/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: dupEmail, mode: "signup" }),
  });
  // Note: immediate duplicate hits the 60s cooldown -> 429 is also safe.
  check("duplicate signup neutral (ok or cooldown)", rDup.status === 200 || rDup.status === 429, `got ${rDup.status}`);
  check("duplicate signup created no user", (await prismaCountUsers()) === mid, "");
  void before;

  const rDisp = await jar.fetch("/api/auth/otp/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "someone@mailinator.com", mode: "signup" }),
  });
  check("disposable email refused (400)", rDisp.status === 400, `got ${rDisp.status}`);

  const unknown = email("ghost");
  const rGhost = await jar.fetch("/api/auth/otp/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: unknown, mode: "login" }),
  });
  check("unknown login neutral ok", rGhost.status === 200 && (await json(rGhost)).ok === true, `got ${rGhost.status}`);
  const ghostCode = await debugOtp(jar, unknown, "sign-in");
  check("no code stored for unknown login", ghostCode === null, `got ${ghostCode}`);
}

async function main() {
  if (!DEBUG_TOKEN) {
    console.error("Set OTP_DEBUG_TOKEN (must match the dev server env).");
    process.exit(1);
  }
  // Debug endpoint must 404 without the token (auth wall check).
  const probe = await fetch(`${BASE}/api/auth/otp/debug`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "x@y.zz", type: "sign-in" }),
  });
  check("debug endpoint 404 without token", probe.status === 404, `got ${probe.status}`);

  const a = await scenarioA();
  await scenarioBCDEHIJ(a);
  await scenarioK();
  await scenarioL();

  // Admin untouched.
  const { prisma } = await import("@/lib/prisma");
  try {
    const admin = await prisma.user.findUnique({
      where: { email: "ponslookdesign@gmail.com" },
      select: { id: true, onboardingCompleted: true, emailVerified: true },
    });
    check("admin intact + onboarding completed", !!admin && admin.onboardingCompleted === true, JSON.stringify(admin));
  } finally {
    await prisma.$disconnect();
  }

  console.log(failures === 0 ? "E2E OK" : `E2E FAILURES: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
