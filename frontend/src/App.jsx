import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  addRipple,
  createCapsule,
  getCapsule,
  loadMine,
  loadName,
  saveMine,
  saveName,
} from "./api.js";

/* ---------- tiny router ---------- */
function usePath() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const go = useCallback((to) => {
    window.history.pushState({}, "", to);
    setPath(to);
    window.scrollTo(0, 0);
  }, []);
  return [path, go];
}

/* ---------- helpers ---------- */
const fmtDate = (iso) =>
  new Date(iso).toLocaleString(undefined, {
    dateStyle: "long",
    timeStyle: "short",
  });

function splitRemaining(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  };
}

function toLocalInputValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

const PRESETS = [
  { label: "1 week", add: (d) => d.setDate(d.getDate() + 7) },
  { label: "1 month", add: (d) => d.setMonth(d.getMonth() + 1) },
  { label: "6 months", add: (d) => d.setMonth(d.getMonth() + 6) },
  { label: "1 year", add: (d) => d.setFullYear(d.getFullYear() + 1) },
  { label: "5 years", add: (d) => d.setFullYear(d.getFullYear() + 5) },
];

/* ---------- decorative ripples ---------- */
function Rings() {
  return (
    <div className="rings" aria-hidden="true">
      <span /> <span /> <span /> <span />
    </div>
  );
}

/* ---------- countdown ---------- */
function Countdown({ target, offsetMs, onDone }) {
  const [left, setLeft] = useState(() => new Date(target).getTime() - (Date.now() + offsetMs));

  useEffect(() => {
    const tick = () => {
      const remaining = new Date(target).getTime() - (Date.now() + offsetMs);
      setLeft(remaining);
      if (remaining <= 0) onDone?.();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target, offsetMs, onDone]);

  const t = splitRemaining(left);
  const cells = [
    ["days", t.days],
    ["hours", t.hours],
    ["minutes", t.minutes],
    ["seconds", t.seconds],
  ];
  return (
    <div className="countdown" role="timer" aria-label="Time until the capsule opens">
      {cells.map(([label, value]) => (
        <div key={label} className="cd-cell">
          <strong>{String(value).padStart(2, "0")}</strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- share box ---------- */
function ShareBox({ slug }) {
  const url = `${window.location.origin}/c/${slug}`;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", url);
    }
  };
  return (
    <div className="share">
      <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Capsule link" />
      <button type="button" className="btn secondary" onClick={copy}>
        {copied ? "Copied ✓" : "Copy link"}
      </button>
    </div>
  );
}

/* ---------- create form ---------- */
function CreateForm({ onCreated }) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState(loadName());
  const [message, setMessage] = useState("");
  const [unlock, setUnlock] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const minValue = useMemo(() => toLocalInputValue(new Date(Date.now() + 60_000)), []);

  const applyPreset = (preset) => {
    const d = new Date();
    preset.add(d);
    setUnlock(toLocalInputValue(d));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!unlock) return setError("Pick when the capsule should open.");
    const when = new Date(unlock);
    if (when.getTime() <= Date.now()) return setError("Pick a moment in the future.");
    setBusy(true);
    try {
      saveName(author.trim());
      const res = await createCapsule({
        title: title.trim(),
        author: author.trim(),
        message: message.trim(),
        unlock_at: when.toISOString(),
      });
      saveMine({
        slug: res.slug,
        title: res.title,
        unlock_at: res.unlock_at,
        created: new Date().toISOString(),
      });
      onCreated(res.slug);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card form" onSubmit={submit}>
      <h2>Seal a capsule</h2>

      <label>
        Title
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          placeholder="Things I want to remember about this year"
          required
        />
      </label>

      <label>
        Your name
        <input
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          maxLength={60}
          placeholder="Future-me"
          required
        />
      </label>

      <label>
        Your message
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={5000}
          rows={7}
          placeholder="Dear future me… what are you hoping for? What's on your mind today?"
          required
        />
        <small className="hint">{message.length}/5000</small>
      </label>

      <label>
        Opens on
        <input
          type="datetime-local"
          value={unlock}
          min={minValue}
          onChange={(e) => setUnlock(e.target.value)}
          required
        />
      </label>
      <div className="chips" role="group" aria-label="Quick dates">
        {PRESETS.map((p) => (
          <button type="button" key={p.label} className="chip" onClick={() => applyPreset(p)}>
            {p.label}
          </button>
        ))}
      </div>

      <p className="note">
        Once sealed, nobody can read it, not even you, until it opens. Your message stays on the
        server and is only sent to browsers after the opening time.
      </p>

      {error && <p className="error" role="alert">{error}</p>}

      <button className="btn" disabled={busy}>
        {busy ? "Sealing…" : "Seal capsule"}
      </button>
    </form>
  );
}

/* ---------- my capsules ---------- */
function MyCapsules({ go }) {
  const [list] = useState(loadMine);
  if (!list.length) return null;
  return (
    <section className="card mine">
      <h2>Your capsules</h2>
      <ul>
        {list.map((c) => {
          const open = new Date(c.unlock_at).getTime() <= Date.now();
          return (
            <li key={c.slug}>
              <a
                href={`/c/${c.slug}`}
                onClick={(e) => {
                  e.preventDefault();
                  go(`/c/${c.slug}`);
                }}
              >
                {c.title}
              </a>
              <span className={`badge ${open ? "open" : ""}`}>
                {open ? "Open" : `Opens ${new Date(c.unlock_at).toLocaleDateString()}`}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ---------- home ---------- */
function Home({ go }) {
  return (
    <>
      <header className="hero">
        <Rings />
        <h1>Ripple</h1>
        <p>
          Write something today. Seal it. Let it travel through time to future you and the
          friends you invite to add their own ripples.
        </p>
      </header>
      <div className="grid">
        <CreateForm onCreated={(slug) => go(`/c/${slug}?new=1`)} />
        <MyCapsules go={go} />
      </div>
    </>
  );
}

/* ---------- add ripple form ---------- */
function RippleForm({ slug, onAdded }) {
  const [author, setAuthor] = useState(loadName());
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      saveName(author.trim());
      await addRipple(slug, { author: author.trim(), message: message.trim() });
      setMessage("");
      setDone(true);
      onAdded?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card form" onSubmit={submit}>
      <h2>Drop a ripple</h2>
      <p className="note">
        Add your own sealed note. It will stay hidden until the capsule opens.
      </p>
      <label>
        Your name
        <input value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={60} required />
      </label>
      <label>
        Your note
        <textarea
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            setDone(false);
          }}
          rows={4}
          maxLength={1000}
          placeholder="Hey, remember when…"
          required
        />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      {done && <p className="success">Ripple sealed inside ✓</p>}
      <button className="btn" disabled={busy}>{busy ? "Sealing…" : "Add ripple"}</button>
    </form>
  );
}

/* ---------- capsule view ---------- */
function CapsuleView({ slug, go, isNew }) {
  const [capsule, setCapsule] = useState(null);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0); // server time minus local time

  const load = useCallback(async () => {
    try {
      const data = await getCapsule(slug);
      setOffset(new Date(data.server_time).getTime() - Date.now());
      setCapsule(data);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, [slug]);

  useEffect(() => {
    setCapsule(null);
    load();
  }, [load]);

  if (error) {
    return (
      <div className="card center">
        <h2>Hmm.</h2>
        <p>{error}</p>
        <button className="btn secondary" onClick={() => go("/")}>Back home</button>
      </div>
    );
  }
  if (!capsule) return <p className="loading">Listening for ripples…</p>;

  const backLink = (
    <a
      href="/"
      className="back"
      onClick={(e) => {
        e.preventDefault();
        go("/");
      }}
    >
      ← Ripple
    </a>
  );

  if (capsule.locked) {
    return (
      <>
        {backLink}
        <header className="hero small">
          <Rings />
          <p className="eyebrow">Sealed by {capsule.author}</p>
          <h1>{capsule.title}</h1>
          <p>Opens {fmtDate(capsule.unlock_at)}</p>
        </header>

        <Countdown target={capsule.unlock_at} offsetMs={offset} onDone={load} />

        <div className="card">
          <h2>{isNew ? "Sealed ✨ Invite friends" : "Share"}</h2>
          <ShareBox slug={slug} />
          <p className="note">
            {capsule.ripple_count === 0
              ? "No ripples from friends yet."
              : `${capsule.ripple_count} ripple${capsule.ripple_count === 1 ? "" : "s"} waiting inside.`}
          </p>
        </div>

        <RippleForm slug={slug} onAdded={load} />
      </>
    );
  }

  return (
    <>
      {backLink}
      <header className="hero small opened">
        <Rings />
        <p className="eyebrow">
          Sealed by {capsule.author} on {new Date(capsule.created_at).toLocaleDateString()}
        </p>
        <h1>{capsule.title}</h1>
        <p>Opened {fmtDate(capsule.unlock_at)}</p>
      </header>

      <article className="card letter">
        <p className="message">{capsule.message}</p>
        <p className="signature">— {capsule.author}</p>
      </article>

      <section>
        <h2 className="section-title">
          {capsule.ripples?.length
            ? `${capsule.ripples.length} ripple${capsule.ripples.length === 1 ? "" : "s"} from friends`
            : "No ripples from friends this time"}
        </h2>
        {capsule.ripples?.map((r, i) => (
          <div className="card ripple" key={i}>
            <p className="message">{r.message}</p>
            <p className="signature">
              — {r.author} · <time>{new Date(r.created_at).toLocaleDateString()}</time>
            </p>
          </div>
        ))}
      </section>

      <div className="center">
        <button className="btn" onClick={() => go("/")}>Seal a new capsule</button>
      </div>
    </>
  );
}

/* ---------- app ---------- */
export default function App() {
  const [path, go] = usePath();
  const match = path.match(/^\/c\/([^/]+)/);
  const isNew = new URLSearchParams(window.location.search).get("new") === "1";

  return (
    <main className="shell">
      {match ? <CapsuleView slug={match[1]} go={go} isNew={isNew} /> : <Home go={go} />}
      <footer>Ripple · messages across time</footer>
    </main>
  );
}
