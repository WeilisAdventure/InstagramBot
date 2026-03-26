import pytest
from tests.conftest import MockAIProvider


@pytest.mark.asyncio
async def test_mock_generate_reply():
    provider = MockAIProvider()
    reply = await provider.generate_reply("What are your hours?")
    assert "Mock reply to:" in reply
    assert "What are your hours?" in reply


@pytest.mark.asyncio
async def test_mock_translate():
    provider = MockAIProvider()
    result = await provider.translate_and_improve("Hello world")
    assert result["original"] == "Hello world"
    assert result["improved"] == "Improved: Hello world"
    assert result["language"] == "en"
