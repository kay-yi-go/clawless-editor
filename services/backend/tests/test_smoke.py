"""Import every module to surface syntax errors that would otherwise
slip through CI now that the py_compile step is gone. Pytest only catches
syntax errors via the import graph; modules not reached by any test would
silently break."""

from fastapi.testclient import TestClient

from clawless_backend import archive, auth, config, daily, llm, main, rename


def test_all_modules_importable():
    assert main is not None
    assert auth is not None
    assert llm is not None
    assert config is not None
    assert daily is not None
    assert rename is not None
    assert archive is not None


def test_health_endpoint_returns_ok():
    client = TestClient(main.app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_protected_endpoint_unauthenticated_when_key_set(monkeypatch):
    """If CLAWLESS_API_KEY is set, missing X-Clawless-Key on a protected
    endpoint should return 401."""
    monkeypatch.setattr(config.settings, "api_key", "test-secret")
    client = TestClient(main.app)
    response = client.post(
        "/daily-log",
        json={"yesterday_content": None, "today_date": "2026-05-09"},
    )
    assert response.status_code == 401


def test_protected_endpoint_passes_with_correct_key(monkeypatch):
    monkeypatch.setattr(config.settings, "api_key", "test-secret")
    client = TestClient(main.app)
    response = client.post(
        "/daily-log",
        headers={"X-Clawless-Key": "test-secret"},
        json={"yesterday_content": None, "today_date": "2026-05-09"},
    )
    assert response.status_code == 200
    assert "# 2026-05-09" in response.json()["content"]


def test_protected_endpoint_open_when_no_api_key_configured(monkeypatch):
    """When CLAWLESS_API_KEY is empty (default dev mode), auth is disabled."""
    monkeypatch.setattr(config.settings, "api_key", "")
    client = TestClient(main.app)
    response = client.post(
        "/daily-log",
        json={"yesterday_content": None, "today_date": "2026-05-09"},
    )
    assert response.status_code == 200
