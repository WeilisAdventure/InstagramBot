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


