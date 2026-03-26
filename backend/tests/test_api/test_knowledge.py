import pytest


@pytest.mark.asyncio
async def test_knowledge_crud(client):
    # Create
    resp = await client.post("/api/knowledge", json={
        "question": "What are your delivery hours?",
        "answer": "Mon-Fri 9am-6pm, Sat 10am-4pm",
        "category": "Hours",
    })
    assert resp.status_code == 201
    entry_id = resp.json()["id"]

    # List
    resp = await client.get("/api/knowledge")
    assert resp.status_code == 200
    assert len(resp.json()) == 1

    # Update
    resp = await client.patch(f"/api/knowledge/{entry_id}", json={"answer": "24/7"})
    assert resp.status_code == 200
    assert resp.json()["answer"] == "24/7"

    # Delete
    resp = await client.delete(f"/api/knowledge/{entry_id}")
    assert resp.status_code == 204
