"use client";

import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { FormEvent, useEffect, useMemo, useState } from "react";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(payload.error ?? "Request failed"));
  return payload as T;
}

function safeNext() {
  if (typeof window === "undefined") return "/";
  const next = new URLSearchParams(window.location.search).get("next");
  return next?.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("Checking passkey support...");
  const [busy, setBusy] = useState<"login" | "register" | null>(null);
  const nextPath = useMemo(safeNext, []);

  useEffect(() => {
    setMessage(window.PublicKeyCredential ? "Passkey-ready browser detected." : "This browser does not support passkeys.");
  }, []);

  const finish = () => {
    window.location.assign(nextPath);
  };

  const login = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("login");
    setMessage("Opening passkey prompt...");
    try {
      const { options } = await postJson<{ options: Parameters<typeof startAuthentication>[0]["optionsJSON"] }>("/api/auth/login/options", {
        username: username.trim() || undefined,
      });
      const response = await startAuthentication({ optionsJSON: options });
      await postJson("/api/auth/login/verify", { response });
      setMessage("Signed in.");
      finish();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Passkey sign-in failed.");
    } finally {
      setBusy(null);
    }
  };

  const register = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("register");
    setMessage("Opening passkey setup...");
    try {
      const { options } = await postJson<{ options: Parameters<typeof startRegistration>[0]["optionsJSON"] }>("/api/auth/register/options", {
        username: username.trim(),
        displayName: displayName.trim() || username.trim(),
        password,
      });
      const response = await startRegistration({ optionsJSON: options });
      await postJson("/api/auth/register/verify", { username: username.trim(), response });
      setMessage("Passkey saved.");
      finish();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Passkey setup failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="loginShell">
      <section className="loginPanel">
        <div className="loginBrand">
          <span aria-hidden="true">✦</span>
          <div>
            <p>NorthStar</p>
            <small>Private portfolio operations</small>
          </div>
        </div>

        <div className="loginCopy">
          <p className="eyebrow">Secure access</p>
          <h1>Sign in with passkey</h1>
          <p>Use Face ID, Touch ID, Windows Hello or a hardware security key.</p>
        </div>

        <form className="loginForm" onSubmit={login}>
          <label>
            <span>Username</span>
            <input
              autoComplete="username webauthn"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Stephen"
            />
          </label>
          <button className="primary" type="submit" disabled={busy !== null}>
            {busy === "login" ? "Opening passkey..." : "Sign in"}
          </button>
        </form>

        <form className="loginForm loginSetup" onSubmit={register}>
          <div>
            <p className="eyebrow">First device or recovery</p>
            <h2>Set up a passkey</h2>
          </div>
          <label>
            <span>Display name</span>
            <input
              autoComplete="name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Stephen"
            />
          </label>
          <label>
            <span>Current NorthStar password</span>
            <input
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={busy !== null || !username.trim() || !password}>
            {busy === "register" ? "Saving passkey..." : "Create passkey"}
          </button>
        </form>

        <p className="loginMessage">{message}</p>
      </section>
    </main>
  );
}
