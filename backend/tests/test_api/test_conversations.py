import pytest
from app.models.conversation import Conversation, Message


@pytest.mark.asyncio
async def test_list_conversations(client, db_session):
    conv = Conversation(ig_user_id="123", ig_username="testuser", trigger_source="direct_dm", mode="ai")
    db_session.add(conv)
    await db_session.flush()
    msg = Message(conversation_id=conv.id, role="user", content="Hello")
    db_session.add(msg)
    await db_session.commit()

    resp = await client.get("/api/conversations")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["ig_username"] == "testuser"
    assert data[0]["last_message"] == "Hello"


@pytest.mark.asyncio
async def test_get_conversation_detail(client, db_session):
    conv = Conversation(ig_user_id="456", ig_username="user2", trigger_source="comment_rule", mode="human")
    db_session.add(conv)
    await db_session.flush()
    db_session.add(Message(conversation_id=conv.id, role="system", content="Triggered by rule"))
    db_session.add(Message(conversation_id=conv.id, role="user", content="Hi"))
    await db_session.commit()

    resp = await client.get(f"/api/conversations/{conv.id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["mode"] == "human"
    assert len(data["messages"]) == 2


@pytest.mark.asyncio
async def test_simulate(client):
    # First create a rule
    await client.post("/api/rules", json={
        "name": "Test Rule",
        "keywords": ["price"],
        "match_mode": "contains",
        "public_reply_template": "Check DMs, {name}!",
        "dm_template": "Hi {name}, prices start at $10.",
        "follow_up_mode": "ai",
    })

    # Simulate
    resp = await client.post("/api/simulate", json={
        "comment_text": "What is the price?",
        "username": "john",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["triggered"] is True
    assert data["matched_rule"] == "Test Rule"
    assert "john" in data["public_reply"]
    assert data["conversation_id"] is not None


@pytest.mark.asyncio
async def test_simulate_no_match(client):
    resp = await client.post("/api/simulate", json={
        "comment_text": "Nice photo!",
        "username": "jane",
    })
    assert resp.status_code == 200
    assert resp.json()["triggered"] is False
