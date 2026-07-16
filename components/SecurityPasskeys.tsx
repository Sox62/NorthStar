"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { FormEvent, useEffect, useState } from "react";
import { Card, Notice, StatusBadge, SummaryGrid } from "@/northstar/components";

const API_TIMEOUT_MS = 20_000;
const PASSKEY_TIMEOUT_MS = 75_000;

async function postJson<T>(url: string, body: unknown): Promise<T> {
  return sendJson<T>(url, "POST", body);
}

async function sendJson<T>(url: string, method: "POST", body: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(payload.error ?? "Request failed"));
    return payload as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("NorthStar did not respond. Try again.");
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

export default function SecurityPasskeys() {
  const [displayName, setDisplayName] = useState("Stephen");
  const [password, setPassword] = useState("");
  const [removePassword, setRemovePassword] = useState("");
  const [registered, setRegistered] = useState<boolean | null>(null);
  const [passkeyCount, setPasskeyCount] = useState<number | null>(null);
  const [message, setMessage] = useState("Checking passkey status...");
  const [busy, setBusy] = useState(false);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported(Boolean(window.PublicKeyCredential));
    let cancelled = false;

    async function loadStatus() {
      try {
        const response = await fetch("/api/auth/passkeys/status", { cache: "no-store" });
        const payload = await response.json();
        if (cancelled) return;
        setRegistered(Boolean(payload.registered));
        setPasskeyCount(Number(payload.count ?? 0));
        setMessage(payload.registered ? "Passkey sign-in is available on the login page." : "No passkey registered yet.");
      } catch {
        if (!cancelled) setMessage("Unable to read passkey status.");
      }
    }

    void loadStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  const createPasskey = async (event: FormEvent) => {
    event.preventDefault();
    if (!supported) {
      setMessage("This browser does not support passkeys.");
      return;
    }

    setBusy(true);
    setMessage("Opening passkey setup...");
    try {
      const { options, username } = await postJson<{
        options: Parameters<typeof startRegistration>[0]["optionsJSON"];
        username: string;
      }>("/api/auth/register/options", {
        displayName: displayName.trim() || "Stephen",
        password,
      });
      const response = await withTimeout(
        startRegistration({ optionsJSON: options }),
        "Passkey setup timed out.",
      );
      await postJson("/api/auth/register/verify", { username, response });
      setRegistered(true);
      setPasskeyCount((count) => Math.max((count ?? 0) + 1, 1));
      setPassword("");
      setMessage("Passkey saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Passkey setup failed.");
    } finally {
      setBusy(false);
    }
  };

  const removePasskeys = async (event: FormEvent) => {
    event.preventDefault();
    setRemoveBusy(true);
    setMessage("Removing saved passkeys...");
    try {
      const { deleted } = await postJson<{ deleted: number }>("/api/auth/passkeys/remove", { password: removePassword });
      setRegistered(false);
      setPasskeyCount(0);
      setRemovePassword("");
      setMessage(deleted ? "Saved passkeys removed. Password login remains active." : "No saved passkeys were found.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to remove saved passkeys.");
    } finally {
      setRemoveBusy(false);
    }
  };

  const visiblePasskeyCount = passkeyCount ?? (registered ? 1 : 0);
  const passkeyLabel = registered
    ? `${visiblePasskeyCount} passkey${visiblePasskeyCount === 1 ? "" : "s"}`
    : "Not set";

  return (
    <>
      <Card className="securityCard">
        <div className="securityCardHeader">
          <div>
            <p className="eyebrow">Passkey</p>
            <h2 className="cardTitle">Face ID / Touch ID access</h2>
            <p className="cardIntro">Add a device passkey after confirming the current NorthStar password.</p>
          </div>
          <StatusBadge tone={registered ? "good" : "warning"}>{passkeyLabel}</StatusBadge>
        </div>

        <form className="securityForm" onSubmit={createPasskey}>
          <label className="field">
            <span>Display name</span>
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" />
          </label>
          <label className="field">
            <span>Current NorthStar password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <button className="primary" type="submit" disabled={busy || !password || !supported}>
            {busy ? "Opening passkey..." : registered ? "Add another passkey" : "Create passkey"}
          </button>
        </form>

        <Notice tone={registered ? "success" : "neutral"} title={registered ? "Passkey login ready" : "Password recovery remains active"}>
          {message}
        </Notice>

        {registered ? (
          <form className="securityForm securityDanger" onSubmit={removePasskeys}>
            <label className="field">
              <span>Current NorthStar password</span>
              <input
                type="password"
                value={removePassword}
                onChange={(event) => setRemovePassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <button type="submit" disabled={removeBusy || !removePassword}>
              {removeBusy ? "Removing passkeys..." : "Remove saved passkeys"}
            </button>
          </form>
        ) : null}
      </Card>

      <Card className="securityCard">
        <p className="eyebrow">Recovery</p>
        <h2 className="cardTitle">Password access</h2>
        <p className="cardIntro">The plain password login stays available as the recovery path if a device passkey is lost.</p>
        <SummaryGrid
          entries={[
            ["Primary login", registered ? "Passkey or password" : "Password"],
            ["Recovery login", "Password"],
            ["Saved passkeys", String(visiblePasskeyCount)],
            ["Passkey support", supported ? "Available in this browser" : "Not available"],
          ]}
        />
      </Card>
    </>
  );
}
