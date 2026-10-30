import os
import tempfile
import time
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

os.environ["RIPPLE_DB"] = os.path.join(tempfile.mkdtemp(), "test.db")

import main  # noqa: E402


@pytest.fixture()
def client():
    main.init_db()
    with TestClient(main.app) as c:
        yield c


def iso(delta):
    return (datetime.now(timezone.utc) + delta).isoformat()


def make(client, delta=timedelta(days=1), **kw):
    body = {"title": "Hello", "author": "Me", "message": "secret words", "unlock_at": iso(delta)}
    body.update(kw)
    return client.post("/api/capsules", json=body)


def test_past_date_rejected(client):
    r = make(client, timedelta(seconds=-5))
    assert r.status_code == 400


def test_locked_capsule_hides_message(client):
    slug = make(client).json()["slug"]
    data = client.get(f"/api/capsules/{slug}").json()
    assert data["locked"] is True
    assert "message" not in data and "ripples" not in data
    assert "secret words" not in client.get(f"/api/capsules/{slug}").text


def test_ripples_counted_but_hidden_while_locked(client):
    slug = make(client).json()["slug"]
    r = client.post(f"/api/capsules/{slug}/ripples", json={"author": "Sam", "message": "hi from sam"})
    assert r.status_code == 201
    data = client.get(f"/api/capsules/{slug}").json()
    assert data["ripple_count"] == 1
    assert "hi from sam" not in str(data)


def test_unlocks_and_reveals(client):
    slug = make(client, timedelta(seconds=1)).json()["slug"]
    client.post(f"/api/capsules/{slug}/ripples", json={"author": "Sam", "message": "hi from sam"})
    time.sleep(1.2)
    data = client.get(f"/api/capsules/{slug}").json()
    assert data["locked"] is False
    assert data["message"] == "secret words"
    assert data["ripples"][0]["author"] == "Sam"
    # opened capsules refuse new ripples
    r = client.post(f"/api/capsules/{slug}/ripples", json={"author": "Late", "message": "too late"})
    assert r.status_code == 409


def test_unknown_slug_404(client):
    assert client.get("/api/capsules/nope").status_code == 404


def test_validation(client):
    assert make(client, title="").status_code == 422
