"use client";

import { useCallback, useEffect, useState } from "react";
import { apiPost } from "@/lib/api-client";
import { requestText } from "@/lib/text-dialog";

interface Account {
  slot: number;
  label: string;
  active: boolean;
}
interface Status {
  configured: boolean;
  connected: boolean;
  accounts?: Account[];
  activeLabel?: string;
}

/** Told to the work screen, so cards reload the new account's policies. */
export const ACCOUNT_CHANGED = "ebay-account-changed";
const announce = () => window.dispatchEvent(new CustomEvent(ACCOUNT_CHANGED));

export function EbayConnect() {
  const [status, setStatus] = useState<Status | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; msg: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [authorizeUrl, setAuthorizeUrl] = useState("");
  const [pasteValue, setPasteValue] = useState("");
  // Connecting one more account, under the name she typed ("Clothing").
  const [adding, setAdding] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/ebay/status", { cache: "no-store" });
      setStatus((await r.json()) as Status);
    } catch {
      setStatus({ configured: false, connected: false });
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Surface the result of an OAuth round-trip (?ebay=connected|declined|error).
    const params = new URLSearchParams(window.location.search);
    const e = params.get("ebay");
    if (e === "connected")
      setNotice({ ok: true, msg: "eBay account connected!" });
    else if (e === "declined")
      setNotice({ ok: false, msg: "eBay connection was declined." });
    else if (e === "error")
      setNotice({
        ok: false,
        msg: params.get("msg") || "eBay connection failed.",
      });
    if (e) window.history.replaceState({}, "", window.location.pathname);
  }, [refresh]);

  const active = status?.accounts?.find((a) => a.active);

  const disconnect = async () => {
    setBusy(true);
    try {
      await apiPost("/api/ebay/disconnect", active ? { slot: active.slot } : {});
      await refresh();
      announce();
      setNotice({
        ok: true,
        msg: active ? `Disconnected ${active.label} from this program.` : "Disconnected from eBay.",
      });
    } finally {
      setBusy(false);
    }
  };

  const switchTo = async (slot: number) => {
    setBusy(true);
    setNotice(null);
    try {
      const r = await apiPost("/api/ebay/accounts", { action: "switch", slot });
      const d = (await r.json()) as { ok: boolean; label?: string; error?: string };
      if (!d.ok) throw new Error(d.error || "Couldn't switch the eBay account.");
      await refresh();
      announce();
      setNotice({ ok: true, msg: `Now posting to ${d.label}.` });
    } catch (e) {
      setNotice({ ok: false, msg: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const rename = async () => {
    if (!active) return;
    const label = await requestText(`New name for the eBay account "${active.label}"`);
    if (!label?.trim()) return;
    setBusy(true);
    try {
      const r = await apiPost("/api/ebay/accounts", { action: "rename", slot: active.slot, label });
      const d = (await r.json()) as { ok: boolean; error?: string };
      if (!d.ok) throw new Error(d.error || "Couldn't rename the account.");
      await refresh();
      announce();
    } catch (e) {
      setNotice({ ok: false, msg: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const addAccount = async () => {
    const label = await requestText(
      "Name for the eBay account you are adding — for example Jewelry or Clothing",
    );
    if (!label?.trim()) return;
    setAdding(label.trim());
    setAuthorizeUrl("");
    setPasteValue("");
    await startConnect(label.trim());
  };

  const startConnect = async (label?: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const r = await apiPost("/api/ebay/auth", label ? { label } : {});
      const data = (await r.json()) as {
        ok: boolean;
        url?: string;
        error?: string;
      };
      if (!data.ok || !data.url)
        throw new Error(data.error || "Couldn't start eBay authorization.");
      setAuthorizeUrl(data.url);
    } catch (e) {
      setNotice({ ok: false, msg: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const finishConnect = async () => {
    if (!pasteValue.trim()) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await apiPost("/api/ebay/connect", {
        url: pasteValue.trim(),
        ...(adding ? { label: adding } : {}),
      });
      const data = (await r.json()) as { ok: boolean; label?: string; error?: string };
      if (!data.ok) throw new Error(data.error || "Couldn't connect.");
      setPasteValue("");
      setAdding(null);
      setAuthorizeUrl("");
      await refresh();
      announce();
      setNotice({
        ok: true,
        msg: data.label ? `eBay account ${data.label} connected — now posting to it.` : "eBay account connected!",
      });
    } catch (e) {
      setNotice({ ok: false, msg: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  // If eBay isn't configured on the server, show nothing (the writing flow
  // still works fine without it).
  if (!status?.configured) return null;

  return (
    <div className={`ebay-bar${status.connected ? " connected" : ""}`}>
      <span className="ebay-dot" aria-hidden="true" />
      {status.connected && !adding ? (
        <>
          {status.accounts?.length ? (
            <label className="ebay-label ebay-account">
              Posting to eBay account{" "}
              <select
                aria-label="eBay account"
                value={active?.slot ?? ""}
                disabled={busy}
                onChange={(e) => void switchTo(Number(e.target.value))}
              >
                {status.accounts.map((a) => (
                  <option key={a.slot} value={a.slot}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span className="ebay-label">eBay account connected</span>
          )}
          <span className="ebay-actions">
            {active && (
              <button type="button" className="btn-ghost" onClick={rename} disabled={busy}>
                Rename
              </button>
            )}
            <button type="button" className="btn-ghost" onClick={addAccount} disabled={busy}>
              + Add account
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={disconnect}
              disabled={busy}
            >
              Disconnect
            </button>
          </span>
        </>
      ) : (
        <>
          <span className="ebay-label">
            <strong>Step 1:</strong>{" "}
            {adding ? (
              <>
                sign in on eBay with the account for <strong>{adding}</strong>
              </>
            ) : (
              "authorize on eBay"
            )}
          </span>
          {adding ? (
            <>
              {!authorizeUrl && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => void startConnect(adding)}
                  disabled={busy}
                >
                  Open eBay ↗
                </button>
              )}
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setAdding(null);
                  setAuthorizeUrl("");
                  setPasteValue("");
                }}
                disabled={busy}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => void startConnect()}
              disabled={busy}
            >
              Open eBay ↗
            </button>
          )}
          {authorizeUrl && (
            <a href={authorizeUrl} target="_blank" rel="noopener noreferrer">
              Continue to eBay ↗
            </a>
          )}
          <div className="ebay-paste">
            <label htmlFor="ebay-paste">
              <strong>Step 2:</strong> after you click <em>Agree</em>, copy the
              URL from eBay&rsquo;s page and paste it here:
            </label>
            <div className="ebay-paste-row">
              <input
                id="ebay-paste"
                type="text"
                placeholder="https://auth2.ebay.com/oauth2/…?code=…"
                value={pasteValue}
                onChange={(e) => setPasteValue(e.target.value)}
              />
              <button
                type="button"
                className="btn-ghost"
                onClick={finishConnect}
                disabled={busy || !pasteValue.trim()}
              >
                {busy ? "Connecting…" : "Finish connecting"}
              </button>
            </div>
          </div>
        </>
      )}
      {notice && (
        <span className={`ebay-notice${notice.ok ? "" : " err"}`}>
          {notice.msg}
        </span>
      )}
    </div>
  );
}
