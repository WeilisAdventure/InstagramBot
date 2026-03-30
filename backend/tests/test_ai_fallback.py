"""Tests for AI fallback behavior: technical failure and knowledge insufficient."""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from app.ai.base import AIProvider
from app.services.message_handler import MessageHandler
from app.instagram.base import IncomingMessage
from app.models.conversation import Conversation, Message
from app.models.settings import SystemSettings


class FailingAIProvider(AIProvider):
    """AI provider that always raises an exception."""
    async def generate_reply(self, user_message, conversation_history=None):
        raise Exception("API key invalid")

    async def translate_and_improve(self, text):
        return {"original": text, "improved": text, "language": "en"}

    async def translate_message(self, text):
        return {"original": text, "translated": text, "source_lang": "en"}

    def reload_knowledge(self, extra_qa=None):
        pass


class CannotAnswerAIProvider(AIProvider):
    """AI provider that returns __CANNOT_ANSWER__ marker."""
    async def generate_reply(self, user_message, conversation_history=None):
        return "__CANNOT_ANSWER__"

    async def translate_and_improve(self, text):
        return {"original": text, "improved": text, "language": "en"}

    async def translate_message(self, text):
        return {"original": text, "translated": text, "source_lang": "en"}

    def reload_knowledge(self, extra_qa=None):
        pass


class NormalAIProvider(AIProvider):
    """AI provider that returns a normal reply."""
    async def generate_reply(self, user_message, conversation_history=None):
        return "Hello! How can I help you today?"

    async def translate_and_improve(self, text):
        return {"original": text, "improved": text, "language": "en"}

    async def translate_message(self, text):
        return {"original": text, "translated": text, "source_lang": "en"}

    def reload_knowledge(self, extra_qa=None):
        pass


@pytest.mark.asyncio
async def test_technical_failure_saves_error_system_message(db_session):
    """When AI API fails, save [AI_ERROR] system message, don't send DM."""
    # Setup conversation
    conv = Conversation(ig_user_id="111", ig_username="user1", trigger_source="direct_dm", mode="ai")
    db_session.add(conv)
    await db_session.flush()

    # Add auto_reply_enabled setting
    db_session.add(SystemSettings(key="auto_reply_enabled", value="true"))
    await db_session.commit()

    mock_ig = MagicMock()
    mock_ig.send_dm = AsyncMock(return_value=True)
    mock_ig.get_user_profile = AsyncMock(return_value=None)

    handler = MessageHandler(ai=FailingAIProvider(), ig=mock_ig)

    msg = IncomingMessage(sender_id="111", sender_username="user1", message_id="m1", text="Hello", timestamp=1000.0)

    with patch('app.services.message_handler.async_session') as mock_session_factory:
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=db_session)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)

        await handler.handle_dm(msg)

    # DM should NOT have been sent
    mock_ig.send_dm.assert_not_called()

    # Check that an [AI_ERROR] system message was saved
    from sqlalchemy import select
    result = await db_session.execute(
        select(Message).where(
            Message.conversation_id == conv.id,
            Message.role == "system"
        )
    )
    system_msgs = result.scalars().all()
    error_msgs = [m for m in system_msgs if m.content.startswith("[AI_ERROR]")]
    assert len(error_msgs) == 1
    assert "API key invalid" in error_msgs[0].content


@pytest.mark.asyncio
async def test_cannot_answer_saves_system_message(db_session):
    """When AI returns __CANNOT_ANSWER__, save system message, don't send DM."""
    conv = Conversation(ig_user_id="222", ig_username="user2", trigger_source="direct_dm", mode="ai")
    db_session.add(conv)
    await db_session.flush()

    db_session.add(SystemSettings(key="auto_reply_enabled", value="true"))
    await db_session.commit()

    mock_ig = MagicMock()
    mock_ig.send_dm = AsyncMock(return_value=True)
    mock_ig.get_user_profile = AsyncMock(return_value=None)

    handler = MessageHandler(ai=CannotAnswerAIProvider(), ig=mock_ig)

    msg = IncomingMessage(sender_id="222", sender_username="user2", message_id="m2", text="What is the weather today?", timestamp=1000.0)

    with patch('app.services.message_handler.async_session') as mock_session_factory:
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=db_session)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)

        await handler.handle_dm(msg)

    # DM should NOT have been sent
    mock_ig.send_dm.assert_not_called()

    # Check that a [CANNOT_ANSWER] system message was saved
    from sqlalchemy import select
    result = await db_session.execute(
        select(Message).where(
            Message.conversation_id == conv.id,
            Message.role == "system"
        )
    )
    system_msgs = result.scalars().all()
    cannot_msgs = [m for m in system_msgs if m.content.startswith("[CANNOT_ANSWER]")]
    assert len(cannot_msgs) == 1
    assert "What is the weather today?" in cannot_msgs[0].content


@pytest.mark.asyncio
async def test_normal_reply_sends_dm(db_session):
    """When AI replies normally, DM should be sent."""
    conv = Conversation(ig_user_id="333", ig_username="user3", trigger_source="direct_dm", mode="ai")
    db_session.add(conv)
    await db_session.flush()

    db_session.add(SystemSettings(key="auto_reply_enabled", value="true"))
    db_session.add(SystemSettings(key="reply_delay_seconds", value="0"))
    db_session.add(SystemSettings(key="translation_strategy", value="never"))
    await db_session.commit()

    mock_ig = MagicMock()
    mock_ig.send_dm = AsyncMock(return_value=True)
    mock_ig.get_user_profile = AsyncMock(return_value=None)

    handler = MessageHandler(ai=NormalAIProvider(), ig=mock_ig)

    msg = IncomingMessage(sender_id="333", sender_username="user3", message_id="m3", text="Hi there", timestamp=1000.0)

    with patch('app.services.message_handler.async_session') as mock_session_factory:
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=db_session)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)

        await handler.handle_dm(msg)

    # DM SHOULD have been sent
    mock_ig.send_dm.assert_called_once_with("333", "Hello! How can I help you today?")
