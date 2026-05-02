# Configuration Reference

All config lives in two places:

1. **`.env` file** — read at process start by `backend/app/config.py`. Requires a service restart to take effect.
2. **`system_settings` DB table** — read at request time via the Settings UI. Takes effect immediately, no restart needed.

---

## .env variables

Create the file at `/opt/instabot/backend/.env`. Any key not set falls back to the default shown.

### Instagram

| Variable | Default | Required | Notes |
|----------|---------|----------|-------|
| `IG_MODE` | `instagrapi` | Yes | Use `graph_api` in production (Meta webhooks). `instagrapi` is for local dev only. |
| `INSTAGRAM_PAGE_ACCESS_TOKEN` | `""` | Yes (graph_api) | Long-lived Page Access Token from Meta. Expires ~60 days. |
| `INSTAGRAM_APP_SECRET` | `""` | Yes (graph_api) | App Secret from Meta Developer Console. Used to verify webhook signatures. |
| `INSTAGRAM_VERIFY_TOKEN` | `""` | Yes (graph_api) | Any random string — must match what you set in the Meta webhook config. |
| `INSTAGRAM_ACCOUNT_ID` | `""` | Yes (graph_api) | Numeric Instagram Business Account ID. |
| `IG_USERNAME` | `""` | No | Instagram username. Only for `instagrapi` mode. |
| `IG_PASSWORD` | `""` | No | Instagram password. Only for `instagrapi` mode. |
| `IG_SESSION_FILE` | `session.json` | No | Path to the instagrapi session cache file. |
| `POLL_INTERVAL` | `20` | No | Seconds between DM polls in `instagrapi` mode. |

### AI

Keys here act as fallbacks. Keys entered in the Settings UI (stored in DB) take priority.

| Variable | Default | Required | Notes |
|----------|---------|----------|-------|
| `ANTHROPIC_API_KEY` | `""` | No | Fallback if no Anthropic key set in Settings UI. |
| `OPENAI_API_KEY` | `""` | No | Fallback if no OpenAI key set in Settings UI. |
| `OPENAI_BASE_URL` | `""` | No | Override OpenAI API base URL (e.g. for proxies). |
| `GOOGLE_API_KEY` | `""` | No | Fallback if no Google key set in Settings UI. |
| `AI_PROVIDER` | `claude` | No | Startup default provider. Overridden by DB at request time. |
| `AI_MODEL` | `claude-sonnet-4-20250514` | No | Startup default model. Overridden by DB at request time. |

### Auth

| Variable | Default | Required | Notes |
|----------|---------|----------|-------|
| `ADMIN_PASSWORD` | `admin123` | **Yes — change this** | Dashboard login password. |
| `AUTH_SECRET_KEY` | `change-me-to-a-random-string` | **Yes — change this** | JWT signing secret. Changing it logs out all active sessions. |

### App

| Variable | Default | Required | Notes |
|----------|---------|----------|-------|
| `REPLY_DELAY_SECONDS` | `3` | No | Startup default reply delay in seconds. Overridden by DB. |
| `LOG_LEVEL` | `INFO` | No | `DEBUG` / `INFO` / `WARNING` / `ERROR` |

---

## DB settings (system_settings table)

Managed via the Settings UI. To inspect or edit directly:

```bash
sqlite3 $(find /opt/instabot -name "bot.db") \
  "SELECT key, value FROM system_settings ORDER BY key;"
```

### AI

| Key | Values | UI location | Notes |
|-----|--------|-------------|-------|
| `ai_model` | model ID string | Settings → AI 模型 | e.g. `gpt-5.4`, `claude-sonnet-4-20250514`, `gemini-2.5-flash` |
| `ai_model_provider` | `anthropic` / `openai` / `google` / `openai_compatible` | auto-set with model | Used by factory to pick the right provider class |
| `anthropic_api_key` | string | Settings → Anthropic API Key | Overrides env when non-empty |
| `openai_api_key` | string | Settings → OpenAI API Key | Overrides env when non-empty |
| `google_api_key` | string | Settings → Google API Key | Overrides env when non-empty |
| `custom_api_key` | string | Settings → 自定义模型 → API Key | Only used for `openai_compatible` provider |
| `custom_base_url` | URL string | Settings → 自定义模型 → API 地址 | e.g. `https://api.deepseek.com` |

### Auto-reply

| Key | Values | UI location | Notes |
|-----|--------|-------------|-------|
| `auto_reply_enabled` | `true` / `false` | Dashboard master switch | Global kill-switch for AI auto-reply |
| `reply_delay_seconds` | integer | Settings → 回复延迟 | Seconds to wait before sending (simulates human typing) |
| `default_conversation_mode` | `ai` / `human` | Settings → 新对话默认模式 | Mode assigned to new conversations |
| `translation_strategy` | `auto` / `always` / `never` | Settings → 回复语言 | When to translate outgoing messages (see ARCHITECTURE.md §6) |

### Welcome message

| Key | Values | UI location | Notes |
|-----|--------|-------------|-------|
| `welcome_message_enabled` | `true` / `false` | Settings → 欢迎语 → toggle | Send welcome text to first-time DMs |
| `welcome_message_text` | string | Settings → 欢迎语 → textarea | Supports `{name}` / `{{username}}` placeholder |

### Comments

| Key | Values | UI location | Notes |
|-----|--------|-------------|-------|
| `comment_trigger_enabled` | `true` / `false` | Dashboard comment switch | Enable auto-reply + DM on matched comments |

### Notifications

| Key | Values | UI location | Notes |
|-----|--------|-------------|-------|
| `notification_enabled` | `true` / `false` | Settings → 通知 | Master notification switch |
| `notification_sound` | `true` / `false` | Settings → 提示音 | Play audio on new message |
| `notification_desktop` | `true` / `false` | Settings → 桌面通知 | Browser desktop notification (requires permission) |
| `notification_title_flash` | `true` / `false` | Settings → 标签页标题闪烁 | Flash browser tab title |

---

## Knowledge base files

Located in `knowledge_base/` at the repo root. Edit and push to update — no DB migration needed.

| File | Purpose |
|------|---------|
| `system_prompt.md` | AI persona, conversation rules, phone-collection timing, anti-repeat rules |
| `pricing.md` | Pricing tiers by monthly volume; loaded when message mentions price/cost/quote |
| `coverage.md` | Delivery coverage area (Toronto metro + Calgary); loaded on coverage/location keywords or postal codes |
| `sizes.md` | Package size and weight limits; loaded when message mentions size/weight/dimensions |
| `schedule.md` | Pickup cutoff times and schedule; loaded when message mentions timing/pickup/when |

---

## manager_preferences table

Auto-populated by the AI when you include style hints in the generate-reply prompt (e.g. "少用感叹号"). Managed via Settings UI → 管理者偏好.

| Column | Type | Notes |
|--------|------|-------|
| `id` | int PK | |
| `content` | text | The extracted rule, e.g. "使用简洁、专业的语气" |
| `source_prompt` | text | The original prompt hint that generated this rule |
| `is_active` | bool | Only active rows are injected into the system prompt |
| `created_at` | datetime | |
