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
            ("conversations", "ai_prompt_notes", "TEXT"),
            ("messages", "attachments", "JSON"),
        ]
        for table, column, ddl in migrations:
            res = await conn.execute(_sql_text(f"PRAGMA table_info({table})"))
            cols = {row[1] for row in res.fetchall()}
            if column not in cols:
                await conn.execute(_sql_text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))

        # --- Multi-channel rename migration (PR 1) ----------------------------
        # `conversations` previously held Instagram-specific columns:
        #   ig_user_id, ig_username, ig_profile_pic
        # As of multi-channel support these become channel-agnostic:
        #   external_user_id, external_username, external_profile_pic
        # plus a new `channel` column (default 'instagram' for existing rows).
        #
        # Detection: if any of the old names is still present, do the rename.
        # SQLite supports ALTER TABLE ... RENAME COLUMN since 3.25 (2018), so
        # this is safe on any modern Python stdlib.
        res = await conn.execute(_sql_text("PRAGMA table_info(conversations)"))
        conv_cols = {row[1] for row in res.fetchall()}

        renames = [
            ("ig_user_id", "external_user_id"),
            ("ig_username", "external_username"),
            ("ig_profile_pic", "external_profile_pic"),
        ]
        for old, new in renames:
            if old in conv_cols and new not in conv_cols:
                await conn.execute(
                    _sql_text(f"ALTER TABLE conversations RENAME COLUMN {old} TO {new}")
                )

        # Re-read after potential renames
        res = await conn.execute(_sql_text("PRAGMA table_info(conversations)"))
        conv_cols = {row[1] for row in res.fetchall()}
        if "channel" not in conv_cols:
            await conn.execute(
                _sql_text(
                    "ALTER TABLE conversations ADD COLUMN channel VARCHAR(20) "
                    "NOT NULL DEFAULT 'instagram'"
                )
            )

        # Composite index — create_all handles this for new DBs, but explicit
        # IF NOT EXISTS keeps it idempotent on legacy DBs where the index
        # didn't exist before the migration.
        await conn.execute(
            _sql_text(
                "CREATE INDEX IF NOT EXISTS "
                "ix_conversations_channel_external_user_id "
                "ON conversations(channel, external_user_id)"
            )
        )
