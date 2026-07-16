import { NextResponse } from "next/server";

export const runtime = "nodejs";

function firstParam(value: string | string[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function safeNext(value: string | null | undefined) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function pageHtml(input: { error?: string | null; nextPath: string; username?: string | null }) {
  const username = escapeHtml(input.username || "");
  const nextPath = escapeHtml(input.nextPath);
  const error = input.error === "invalid"
    ? '<p class="loginMessage isError">Invalid NorthStar password.</p>'
    : '<p class="loginMessage">Enter the current NorthStar password to continue. Passkey setup can wait until the dashboard is accessible.</p>';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#081019">
  <meta name="color-scheme" content="dark">
  <meta http-equiv="Cache-Control" content="no-store">
  <link rel="icon" href="data:,">
  <title>NorthStar</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #07101a;
      --panel: #101d2b;
      --panel-2: #07111c;
      --line: rgba(124, 148, 173, .28);
      --muted: #8fa0b2;
      --text: #e9edf3;
      --accent: #d6b46b;
      --accent-2: #bd9955;
      --danger: #ff9a9a;
    }
    * { box-sizing: border-box; }
    html, body { min-height: 100%; margin: 0; }
    body {
      display: grid;
      place-items: center;
      padding: 24px;
      background:
        radial-gradient(circle at 50% -20%, rgba(65, 88, 112, .14), transparent 45%),
        linear-gradient(180deg, #050b12, var(--bg));
      color: var(--text);
      font: 16px/1.45 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      width: min(100%, 460px);
      padding: 28px;
      border: 1px solid var(--line);
      border-radius: 24px;
      background:
        radial-gradient(circle at 100% 0%, rgba(215, 181, 109, .12), transparent 52%),
        linear-gradient(145deg, rgba(18, 31, 44, .98), rgba(8, 18, 28, .98));
      box-shadow: 0 30px 90px rgba(0, 0, 0, .34);
    }
    .brand { display: flex; gap: 13px; align-items: center; margin-bottom: 34px; }
    .mark {
      display: grid;
      place-items: center;
      width: 42px;
      height: 42px;
      border: 1px solid rgba(215, 181, 109, .38);
      border-radius: 13px;
      color: var(--accent);
      background: rgba(215, 181, 109, .08);
      font-weight: 800;
    }
    .brand p, h1, h2 { margin: 0; }
    .brand p { font-size: 24px; letter-spacing: .01em; }
    .brand small, .copy p, label span, .loginMessage { color: var(--muted); }
    .eyebrow {
      margin: 0 0 10px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: .18em;
      text-transform: uppercase;
    }
    h1 { font-size: clamp(38px, 7vw, 48px); line-height: 1; font-weight: 650; }
    .copy p:not(.eyebrow) { margin: 14px 0 0; max-width: 34ch; }
    form { display: grid; gap: 14px; margin-top: 28px; }
    label { display: grid; gap: 7px; }
    label span { font-size: 12px; }
    input {
      width: 100%;
      min-height: 52px;
      padding: 12px 14px;
      border: 1px solid rgba(106, 130, 153, .34);
      border-radius: 13px;
      outline: none;
      background: rgba(4, 12, 20, .62);
      color: var(--text);
      font: inherit;
    }
    input:focus { border-color: rgba(215, 181, 109, .58); box-shadow: 0 0 0 3px rgba(215, 181, 109, .12); }
    button {
      min-height: 52px;
      border: 1px solid var(--accent);
      border-radius: 13px;
      background: linear-gradient(135deg, var(--accent), var(--accent-2));
      color: #111820;
      cursor: pointer;
      font: inherit;
      font-weight: 800;
    }
    button.secondaryButton {
      width: 100%;
      margin-top: 14px;
      border-color: rgba(215, 181, 109, .36);
      background: rgba(215, 181, 109, .08);
      color: var(--text);
    }
    button:disabled { cursor: wait; opacity: .72; }
    .separator {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 22px 0 0;
      color: var(--muted);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: .14em;
      text-transform: uppercase;
    }
    .separator::before, .separator::after {
      content: "";
      flex: 1;
      height: 1px;
      background: rgba(124, 148, 173, .22);
    }
    .loginMessage {
      min-height: 18px;
      margin: 18px 0 0;
      padding: 10px 12px;
      border: 1px solid rgba(215, 181, 109, .22);
      border-radius: 11px;
      background: rgba(215, 181, 109, .06);
      font-size: 12px;
    }
    .loginMessage.isError {
      border-color: rgba(255, 154, 154, .36);
      background: rgba(110, 32, 32, .24);
      color: var(--danger);
    }
    .passkeyStatus {
      margin: 10px 0 0;
      color: var(--muted);
      font-size: 12px;
    }
  </style>
</head>
<body>
  <main>
    <div class="brand">
      <span class="mark">N</span>
      <div>
        <p>NorthStar</p>
        <small>Private portfolio operations</small>
      </div>
    </div>
    <div class="copy">
      <p class="eyebrow">Secure access</p>
      <h1>Sign in</h1>
      <p>Use the current NorthStar password. This page is intentionally plain so it cannot hang on passkey or PWA loading.</p>
    </div>
    <form method="post" action="/api/auth/password/login" autocomplete="on">
      <input type="hidden" name="next" value="${nextPath}">
      <input type="hidden" name="username" value="${username}">
      <label>
        <span>Current NorthStar password</span>
        <input name="password" autocomplete="current-password" type="password" required autofocus>
      </label>
      <button type="submit">Use password</button>
    </form>
    <section class="passkeyPanel" id="passkeyPanel" data-next="${nextPath}" hidden>
      <div class="separator"><span>or</span></div>
      <button class="secondaryButton" id="passkeyButton" type="button">Use passkey</button>
      <p class="passkeyStatus" id="passkeyStatus">Checking passkey status...</p>
    </section>
    ${error}
  </main>
  <script>
    (function () {
      var panel = document.getElementById("passkeyPanel");
      var button = document.getElementById("passkeyButton");
      var status = document.getElementById("passkeyStatus");
      if (!panel || !button || !status) return;
      if (!window.PublicKeyCredential || !navigator.credentials) return;

      function base64UrlToBuffer(value) {
        var base64 = value.replace(/-/g, "+").replace(/_/g, "/");
        var padding = "=".repeat((4 - base64.length % 4) % 4);
        var binary = atob(base64 + padding);
        var bytes = new Uint8Array(binary.length);
        for (var index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }
        return bytes.buffer;
      }

      function bufferToBase64Url(buffer) {
        var bytes = new Uint8Array(buffer);
        var binary = "";
        for (var index = 0; index < bytes.length; index += 1) {
          binary += String.fromCharCode(bytes[index]);
        }
        return btoa(binary).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/g, "");
      }

      function requestOptionsFromJson(options) {
        return Object.assign({}, options, {
          challenge: base64UrlToBuffer(options.challenge),
          allowCredentials: (options.allowCredentials || []).map(function (credential) {
            return Object.assign({}, credential, { id: base64UrlToBuffer(credential.id) });
          }),
        });
      }

      function credentialToJson(credential) {
        return {
          id: credential.id,
          rawId: bufferToBase64Url(credential.rawId),
          type: credential.type,
          authenticatorAttachment: credential.authenticatorAttachment || undefined,
          clientExtensionResults: credential.getClientExtensionResults ? credential.getClientExtensionResults() : {},
          response: {
            authenticatorData: bufferToBase64Url(credential.response.authenticatorData),
            clientDataJSON: bufferToBase64Url(credential.response.clientDataJSON),
            signature: bufferToBase64Url(credential.response.signature),
            userHandle: credential.response.userHandle ? bufferToBase64Url(credential.response.userHandle) : undefined,
          },
        };
      }

      async function fetchJson(url, init) {
        var controller = new AbortController();
        var timeout = window.setTimeout(function () { controller.abort(); }, 20000);
        try {
          var response = await fetch(url, Object.assign({ cache: "no-store", signal: controller.signal }, init || {}));
          var payload = await response.json().catch(function () { return {}; });
          if (!response.ok) throw new Error(payload.error || "Request failed.");
          return payload;
        } finally {
          window.clearTimeout(timeout);
        }
      }

      async function showIfReady() {
        try {
          var payload = await fetchJson("/api/auth/passkeys/status");
          if (!payload.registered) return;
          panel.hidden = false;
          status.textContent = "Face ID, Touch ID, Windows Hello or a security key is ready.";
        } catch {
          panel.hidden = true;
        }
      }

      button.addEventListener("click", async function () {
        button.disabled = true;
        status.textContent = "Opening passkey prompt...";
        try {
          var payload = await fetchJson("/api/auth/login/options", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}",
          });
          var credential = await Promise.race([
            navigator.credentials.get({ publicKey: requestOptionsFromJson(payload.options) }),
            new Promise(function (_, reject) {
              window.setTimeout(function () { reject(new Error("Passkey prompt timed out.")); }, 75000);
            }),
          ]);
          if (!credential) throw new Error("Passkey sign-in was cancelled.");
          await fetchJson("/api/auth/login/verify", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ response: credentialToJson(credential) }),
          });
          window.location.assign(panel.getAttribute("data-next") || "/");
        } catch (error) {
          status.textContent = error instanceof Error ? error.message : "Passkey sign-in failed.";
        } finally {
          button.disabled = false;
        }
      });

      void showIfReady();
    })();
  </script>
</body>
</html>`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const nextPath = safeNext(url.searchParams.get("next"));
  const error = url.searchParams.get("error");
  const username = firstParam(url.searchParams.get("username"));
  return new NextResponse(pageHtml({ error, nextPath, username }), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, max-age=0",
    },
  });
}
