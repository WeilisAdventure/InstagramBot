import pytest
from app.models.conversation import Conversation, Message


@pytest.mark.asyncio
async def test_list_conversations(client, db_session):
    conv = Conversation(
        channel="instagram",
        external_user_id="123",
        external_username="testuser",
        trigger_source="direct_dm",
        mode="ai",
    )
    db_session.add(conv)
    await db_session.flush()
    msg = Message(conversation_id=conv.id, role="user", content="Hello")
    db_session.add(msg)
    await db_session.commit()

    resp = await client.get("/api/conversations?channel=instagram")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["external_username"] == "testuser"
    assert data[0]["channel"] == "instagram"
    assert data[0]["last_message"] == "Hello"


@pytest.mark.asyncio
async def test_list_conversations_requires_channel(client, db_session):
    """Missing the `channel` query param must 422 — no silent cross-channel mix."""
    resp = await client.get("/api/conversations")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_list_conversations_filters_by_channel(client, db_session):
    """A conv on one channel must not appear when querying for another."""
    ig_conv = Conversation(
        channel="instagram", external_user_id="123", external_username="ig_user",
        trigger_source="direct_dm", mode="ai",
    )
    tidio_conv = Conversation(
        channel="tidio", external_user_id="123", external_username="tidio_user",
        trigger_source="direct_dm", mode="ai",
    )
    db_session.add_all([ig_conv, tidio_conv])
    await db_session.commit()

    ig_resp = await client.get("/api/conversations?channel=instagram")
    assert ig_resp.status_code == 200
    ig_data = ig_resp.json()
    assert len(ig_data) == 1
    assert ig_data[0]["external_username"] == "ig_user"

    tidio_resp = await client.get("/api/conversations?channel=tidio")
    assert tidio_resp.status_code == 200
    tidio_data = tidio_resp.json()
    assert len(tidio_data) == 1
    assert tidio_data[0]["external_username"] == "tidio_user"


@pytest.mark.asyncio
async def test_get_conversation_detail(client, db_session):
    conv = Conversation(
        channel="instagram",
        external_user_id="456",
        external_username="user2",
        trigger_source="comment_rule",
        mode="human",
    )
    db_session.add(conv)
    await db_session.flush()
    db_session.add(Message(conversation_id=conv.id, role="system", content="Triggered by rule"))
    db_session.add(Message(conversation_id=conv.id, role="user", content="Hi"))
    await db_session.commit()

    resp = await client.get(f"/api/conversations/{conv.id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["mode"] == "human"
    assert data["channel"] == "instagram"
    assert len(data["messages"]) == 2


