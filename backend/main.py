"""Ripple — a time capsule API for future you and your friends."""
import os
import secrets
import sqlite3
from contextlib import asynccontextmanager, contextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

DB_PATH = os.getenv("RIPPLE_DB", os.path.join(os.path.dirname(__file__), "ripple.db"))
ORIGINS = os.getenv("RIPPLE_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")


# ---------- database ----------
@contextmanager
def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS capsules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                slug TEXT UNIQUE NOT NULL,
                title TEXT NOT NULL,
                author TEXT NOT NULL,
                message TEXT NOT NULL,
                created_at TEXT NOT NULL,
                unlock_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS ripples (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                capsule_id INTEGER NOT NULL REFERENCES capsules(id) ON DELETE CASCADE,
                author TEXT NOT NULL,
                message TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            """
        )


# ---------- helpers ----------
def now() -> datetime:
    return datetime.now(timezone.utc)


def to_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def parse(s: str) -> datetime:
    return datetime.fromisoformat(s)


# ---------- schemas ----------
class CapsuleIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    author: str = Field(min_length=1, max_length=60)
    message: str = Field(min_length=1, max_length=5000)
    unlock_at: datetime


class RippleIn(BaseModel):
    author: str = Field(min_length=1, max_length=60)
    message: str = Field(min_length=1, max_length=1000)


# ---------- app ----------
@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Ripple API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"ok": True, "time": now().isoformat()}


@app.post("/api/capsules", status_code=201)
def create_capsule(body: CapsuleIn):
    unlock = to_utc(body.unlock_at)
    if unlock <= now():
        raise HTTPException(400, "Unlock date must be in the future.")
    slug = secrets.token_urlsafe(8)
    with db() as conn:
        conn.execute(
            "INSERT INTO capsules (slug, title, author, message, created_at, unlock_at) VALUES (?,?,?,?,?,?)",
            (slug, body.title.strip(), body.author.strip(), body.message.strip(),
             now().isoformat(), unlock.isoformat()),
        )
    return {"slug": slug, "title": body.title.strip(), "unlock_at": unlock.isoformat()}


def _load(conn, slug: str):
    row = conn.execute("SELECT * FROM capsules WHERE slug = ?", (slug,)).fetchone()
    if not row:
        raise HTTPException(404, "Capsule not found.")
    return row


@app.get("/api/capsules/{slug}")
def get_capsule(slug: str):
    with db() as conn:
        c = _load(conn, slug)
        count = conn.execute(
            "SELECT COUNT(*) FROM ripples WHERE capsule_id = ?", (c["id"],)
        ).fetchone()[0]
        locked = parse(c["unlock_at"]) > now()
        data = {
            "slug": c["slug"],
            "title": c["title"],
            "author": c["author"],
            "created_at": c["created_at"],
            "unlock_at": c["unlock_at"],
            "locked": locked,
            "ripple_count": count,
            "server_time": now().isoformat(),
        }
        # Contents never leave the server until the unlock moment passes.
        if not locked:
            data["message"] = c["message"]
            rows = conn.execute(
                "SELECT author, message, created_at FROM ripples WHERE capsule_id = ? ORDER BY id",
                (c["id"],),
            ).fetchall()
            data["ripples"] = [dict(r) for r in rows]
        return data


@app.post("/api/capsules/{slug}/ripples", status_code=201)
def add_ripple(slug: str, body: RippleIn):
    with db() as conn:
        c = _load(conn, slug)
        if parse(c["unlock_at"]) <= now():
            raise HTTPException(409, "This capsule is already open; it no longer accepts ripples.")
        conn.execute(
            "INSERT INTO ripples (capsule_id, author, message, created_at) VALUES (?,?,?,?)",
            (c["id"], body.author.strip(), body.message.strip(), now().isoformat()),
        )
        count = conn.execute(
            "SELECT COUNT(*) FROM ripples WHERE capsule_id = ?", (c["id"],)
        ).fetchone()[0]
    return {"ok": True, "ripple_count": count}
