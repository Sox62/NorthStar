"use client";

import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

const API_TIMEOUT_MS = 20_000;
const PASSKEY_TIMEOUT_MS = 75_000;

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(payload.error ?? "Request failed"));
    return payload as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("NorthStar did not respond. Check the connection and try again.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  let timeout: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = window.setTimeout(() => reject(new Error(message)), PASSKEY_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout) window.clearTimeout(timeout);
  }
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
  const [passkeysRegistered, setPasskeysRegistered] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<"login" | "register" | "password" | null>(null);
  const nextPath = useMemo(safeNext, []);
  const passwordInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!window.PublicKeyCredential) {
      setMessage("This browser does not support passkeys.");
      return;
    }

    let cancelled = false;
    async function loadPasskeyStatus() {
      try {
        const response = await fetch("/api/auth/passkeys/status", { cache: "no-store" });
        const result = await response.json();
        if (cancelled) return;
        setPasskeysRegistered(Boolean(result.registered));
        setMessage(result.registered
          ? "Passkey-ready browser detected."
          : "No passkey is registered yet. Enter the current NorthStar password below, then create one.");
      } catch {
        if (!cancelled) setMessage("Passkey-ready browser detected.");
      }
    }

    void loadPasskeyStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  const finish = () => {
    window.location.assign(nextPath);
  };

  const login = async (event: FormEvent) => {
    event.preventDefault();
    if (passkeysRegistered === false) {
      setMessage("Create your first passkey before using Sign in.");
      passwordInput.current?.focus();
      return;
    }
    setBusy("login");
    setMessage("Opening passkey prompt...");
    try {
      const { options } = await postJson<{ options: Parameters<typeof startAuthentication>[0]["optionsJSON"] }>("/api/auth/login/options", {
        username: username.trim() || undefined,
      });
      const response = await withTimeout(
        startAuthentication({ optionsJSON: options }),
        "Passkey prompt timed out. Use the password option below, then try passkey setup again.",
      );
      await postJson("/api/auth/login/verify", { response });
      setMessage("Signed in.");
      finish();
    } catch (error) {
      const text = error instanceof Error ? error.message : "Passkey sign-in failed.";
      setMessage(text.includes("No passkeys") ? "No passkey exists yet. Enter the current NorthStar password below, then create one." : text);
      if (text.includes("No passkeys")) passwordInput.current?.focus();
    } finally {
      setBusy(null);
    }
  };

  const passwordLogin = async () => {
    if (!username.trim() || !password) {
      setMessage("Enter your username and current NorthStar password.");
      passwordInput.current?.focus();
      return;
    }

    setBusy("password");
    setMessage("Signing in with password...");
    try {
      await postJson("/api/auth/password/login", {
        username: username.trim(),
        password,
      });
      setMessage("Signed in.");
      finish();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Password sign-in failed.");
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
      const response = await withTimeout(
        startRegistration({ optionsJSON: options }),
        "Passkey setup timed out. Use password sign-in for now, then try setup again.",
      );
      await postJson("/api/auth/register/verify", { username: username.trim(), response });
      setPasskeysRegistered(true);
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
          <button className="primary" type="submit" disabled={busy !== null || passkeysRegistered === false}>
            {busy === "login" ? "Opening passkey..." : passkeysRegistered === false ? "Create passkey first" : "Sign in"}
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
              ref={passwordInput}
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <div className="loginActions">
            <button className="primary" type="button" onClick={passwordLogin} disabled={busy !== null || !username.trim() || !password}>
              {busy === "password" ? "Signing in..." : "Use password"}
            </button>
            <button type="submit" disabled={busy !== null || !username.trim() || !password}>
              {busy === "register" ? "Saving passkey..." : "Create passkey"}
            </button>
          </div>
        </form>

        <p className="loginMessage">{message}</p>
      </section>
    </main>
  );
}
