import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from httpx import AsyncClient, ASGITransport
from app.database import Base, get_db
from app.main import app
from app.ai.base import AIProvider
from app.security import verify_token


class MockAIProvider(AIProvider):
    async def generate_reply(self, user_message, conversation_history=None, extra_prompt=None):
        return f"Mock reply to: {user_message}"

    async def translate_and_improve(self, text):
        return {"original": text, "improved": f"Improved: {text}", "language": "en"}

    async def translate_message(self, text):
        return {"original": text, "translated": f"Translated: {text}", "source_lang": "en"}

    def reload_knowledge(self, extra_qa=None):
        pass


@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_maker() as session:
        yield session
    await engine.dispose()


@pytest_asyncio.fixture
async def client(db_session):
    async def override_get_db():
        yield db_session

    async def override_verify_token():
        return "admin"

    app.dependency_overrides[verify_token] = override_verify_token
    app.dependency_overrides[get_db] = override_get_db
    app.state.ai_provider = MockAIProvider()
    app.state.translator = __import__('app.services.translator', fromlist=['TranslatorService']).TranslatorService(app.state.ai_provider)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()
