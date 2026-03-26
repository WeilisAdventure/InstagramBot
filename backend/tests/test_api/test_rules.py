import pytest


@pytest.mark.asyncio
async def test_create_and_list_rules(client):
    # Create
    resp = await client.post("/api/rules", json={
        "name": "Price Inquiry",
        "keywords": ["price", "cost", "how much"],
        "match_mode": "contains",
        "public_reply_template": "Hi {name}, check your DMs!",
        "dm_template": "Hi {name}, our pricing starts at $10.",
        "follow_up_mode": "ai",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Price Inquiry"
    assert data["keywords"] == ["price", "cost", "how much"]
    rule_id = data["id"]

    # List
    resp = await client.get("/api/rules")
    assert resp.status_code == 200
    rules = resp.json()
    assert len(rules) == 1
    assert rules[0]["id"] == rule_id

    # Get
    resp = await client.get(f"/api/rules/{rule_id}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "Price Inquiry"

    # Update
    resp = await client.patch(f"/api/rules/{rule_id}", json={"name": "Updated Rule"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated Rule"

    # Delete
    resp = await client.delete(f"/api/rules/{rule_id}")
    assert resp.status_code == 204

    # Verify deleted
    resp = await client.get("/api/rules")
    assert len(resp.json()) == 0


@pytest.mark.asyncio
async def test_get_nonexistent_rule(client):
    resp = await client.get("/api/rules/999")
    assert resp.status_code == 404
