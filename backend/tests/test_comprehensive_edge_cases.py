import json
import pytest
from starlette.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_all_comprehensive_edge_cases():
    print("=== STARTING COMPREHENSIVE BACKEND EDGE CASE AUDIT ===")

    # Test 1: Pusty opis, za krótki opis, za długi opis
    r1 = client.post("/api/match", json={"problem_description": ""})
    assert r1.status_code == 422, f"Expected 422 on empty string, got {r1.status_code}"

    r2 = client.post("/api/match", json={"problem_description": "ab"})
    assert r2.status_code == 422, f"Expected 422 on 2 chars, got {r2.status_code}"

    r3 = client.post("/api/match", json={"problem_description": "a" * 2001})
    assert r3.status_code == 422, f"Expected 422 on >2000 chars, got {r3.status_code}"
    print("✔ Test 1: Length bounds (empty, <3, >2000) strictly rejected with 422")

    # Test 2: Whitespace only
    r4 = client.post("/api/match", json={"problem_description": "      \n\t   "})
    assert r4.status_code == 400, f"Expected 400 on whitespace only, got {r4.status_code}"
    print("✔ Test 2: Whitespace only string rejected with 400")

    # Test 3: XSS i SQL Injection payloads w match
    xss_query = "<script>alert(\"XSS\")</script> Pomoc dla osób samotnych starszych"
    r5 = client.post("/api/match", json={"problem_description": xss_query})
    assert r5.status_code == 200
    data5 = r5.json()
    assert "<script>" not in data5["query"], "XSS was not sanitized"
    print("✔ Test 3: XSS payload sanitized properly in /api/match")

    sql_query = "' OR 1=1; DROP TABLE innovations; -- Potrzeba opieki nad dziećmi"
    r6 = client.post("/api/match", json={"problem_description": sql_query})
    assert r6.status_code == 200
    print("✔ Test 4: SQL injection string treated safely without database error")

    # Test 5: Unicode i Emoji
    emoji_query = "👵🧑‍🦽🚌 Chcemy zapewnić dostępny transport door-to-door dla seniorów na wsi"
    r7 = client.post("/api/match", json={"problem_description": emoji_query})
    assert r7.status_code == 200
    data7 = r7.json()
    assert data7["total_found"] > 0
    cnt = data7["total_found"]
    print(f"✔ Test 5: Emoji & Unicode processed cleanly (found {cnt} innovations)")

    # Test 6: Threshold bounds
    r8 = client.post("/api/match", json={"problem_description": "samotność seniorów", "threshold": -0.1})
    assert r8.status_code == 422, f"Expected 422 on negative threshold, got {r8.status_code}"

    r9 = client.post("/api/match", json={"problem_description": "samotność seniorów", "threshold": 1.5})
    assert r9.status_code == 422, f"Expected 422 on threshold > 1.0, got {r9.status_code}"
    print("✔ Test 6: Threshold bounds (negative or >1.0) rejected with 422")

    # Test 7: Limit bounds
    r10 = client.post("/api/match", json={"problem_description": "samotność seniorów", "limit": 0})
    assert r10.status_code == 422, f"Expected 422 on limit=0, got {r10.status_code}"

    r11 = client.post("/api/match", json={"problem_description": "samotność seniorów", "limit": 100})
    assert r11.status_code == 422, f"Expected 422 on limit=100 (>50), got {r11.status_code}"
    print("✔ Test 7: Limit bounds (<1 or >50) rejected with 422")

    # Test 8: Public Single Innovation Path Traversal and SQL Injection
    r12 = client.get("/api/innovations/../../etc/passwd")
    assert r12.status_code in (404, 422), f"Path traversal should fail, got {r12.status_code}"

    r13 = client.get("/api/innovations/inv_01' OR 1=1")
    assert r13.status_code == 422, f"Expected 422 for invalid format ID, got {r13.status_code}"
    print("✔ Test 8: Path traversal and malformed ID rejected with 422/404")

    # Test 9: Public Innovation Draft leak prevention
    r14 = client.get("/api/innovations?status=all")
    assert r14.status_code == 200
    for item in r14.json():
        assert item["status"] == "sprawdzone", f"Draft leaked: {item}"
    print("✔ Test 9: Public catalog strictly returns only 'sprawdzone' even with status=all")

    # Test 10: Middleman AI edge cases
    r15 = client.post("/api/middleman/adapt", json={"innovation_title": "Test", "municipality_context": "krót"})
    assert r15.status_code == 400, f"Expected 400 for too short context, got {r15.status_code}"

    r16 = client.post("/api/middleman/adapt", json={
        "innovation_title": "Mobilny Asystent Seniora",
        "municipality_context": "Gmina wiejska w powiecie krakowskim, 8000 mieszkańców, 40% seniorzy, brak komunikacji publicznej w 5 sołectwach.",
        "municipality_type": "wiejska",
        "budget_range": "15 000 – 30 000 PLN",
        "time_horizon": "3 miesiące",
        "key_partners": ["OSP", "KGW", "CUS"]
    })
    assert r16.status_code == 200
    data16 = r16.json()
    assert "adaptation_plan" in data16
    assert "is_ai_generated" in data16
    src = data16["generation_source"]
    assert src in ("gemini", "openai", "template_fallback")
    plan_len = len(data16["adaptation_plan"])
    print(f"✔ Test 10: Middleman AI generates adaptation plan (length: {plan_len} chars, source: {src})")

    # Test 11: Admin Security Unauthorized Checks
    r17 = client.get("/api/admin/submissions")
    assert r17.status_code in (401, 403), f"Admin submissions should be forbidden for anonymous, got {r17.status_code}"

    r18 = client.post("/api/admin/innovations", json={"title": "Hacked", "category": "Seniorzy", "description": "Hacked"})
    assert r18.status_code in (401, 403), f"Admin create innovation should be forbidden, got {r18.status_code}"
    print("✔ Test 11: Admin endpoints strictly reject anonymous requests with 401/403")

    # Test 12: Submissions User Security
    r19 = client.post("/api/submissions", json={"problem_description": "Test", "title": "Test"})
    assert r19.status_code == 401, f"Creating submission without auth should return 401, got {r19.status_code}"
    print("✔ Test 12: Submissions API requires authentication (401 for anonymous)")

    print("=== ALL 12 CRITICAL EDGE CASES VERIFIED SUCCESSFULLY ===")

if __name__ == "__main__":
    test_all_comprehensive_edge_cases()
