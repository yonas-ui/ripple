const BASE = import.meta.env.VITE_API_URL || "";

async function request(path, options) {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  if (!res.ok) {
    let msg = data?.detail;
    if (Array.isArray(msg)) msg = msg.map((e) => e.msg).join(", ");
    throw new Error(msg || `Request failed (${res.status})`);
  }
  return data;
}

export const createCapsule = (body) =>
  request("/capsules", { method: "POST", body: JSON.stringify(body) });

export const getCapsule = (slug) => request(`/capsules/${encodeURIComponent(slug)}`);

export const addRipple = (slug, body) =>
  request(`/capsules/${encodeURIComponent(slug)}/ripples`, {
    method: "POST",
    body: JSON.stringify(body),
  });

// ---- "my capsules" kept in this browser ----
const KEY = "ripple:mine";

export function loadMine() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || [];
  } catch {
    return [];
  }
}

export function saveMine(entry) {
  try {
    const list = loadMine().filter((c) => c.slug !== entry.slug);
    list.unshift(entry);
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 50)));
  } catch {
    /* storage unavailable */
  }
}

export function loadName() {
  try {
    return localStorage.getItem("ripple:name") || "";
  } catch {
    return "";
  }
}

export function saveName(name) {
  try {
    localStorage.setItem("ripple:name", name);
  } catch {
    /* ignore */
  }
}
