"""Production provider failure must return a clear error, not NameError or test vectors."""
import sys
import pytest
from app.services import ai


def test_gemini_failure_outside_tests_is_explicit(monkeypatch):
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    monkeypatch.delitem(sys.modules, "pytest", raising=False)
    monkeypatch.setattr(sys, "argv", ["uvicorn", "app.main:app"])
    monkeypatch.setattr(ai, "_get_gemini_embedding", lambda _, model_name=None: None)
    with pytest.raises(RuntimeError, match="Błąd usługi embeddingów Gemini"):
        ai._get_embedding_tuple.__wrapped__("Problem seniorów", "gemini-embedding-2")
