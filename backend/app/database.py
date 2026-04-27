from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

DATABASE_URL = "sqlite+aiosqlite:///./bot.db"

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session() as session:
        yield session


async def init_db():
    from sqlalchemy import text as _sql_text

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        # Lightweight in-place schema migrations for SQLite (which create_all
        # does not handle for ALTERs). Each entry: (table, column, ddl).
        migrations = [
            ("comment_events", "permalink", "TEXT"),
        ]
        for table, column, ddl in migrations:
            res = await conn.execute(_sql_text(f"PRAGMA table_info({table})"))
            cols = {row[1] for row in res.fetchall()}
            if column not in cols:
                await conn.execute(_sql_text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
