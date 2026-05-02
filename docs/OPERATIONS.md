# Operations Handbook

Day-to-day runbook for InstaBot. Most tasks are here; architecture is in
[`ARCHITECTURE.md`](ARCHITECTURE.md).

---

## Update code + restart

```bash
cd /opt/instabot && git pull && systemctl restart instabot
```

If Python dependencies changed (new packages in `pyproject.toml`):

```bash
cd /opt/instabot/backend && venv/bin/pip install -e . && systemctl restart instabot
```

---

## Rebuild and deploy frontend

Run this after any frontend code change:

```bash
cd /opt/instabot/frontend && npm run build
```

No restart needed — nginx serves the static files directly from `dist/`.

---

## View logs

```bash
# Live tail
journalctl -u instabot -f

# Last 100 lines
journalctl -u instabot -n 100 --no-pager

# Filter errors only
journalctl -u instabot -n 200 --no-pager | grep -i "error\|exception\|failed"

# Logs since a specific time
journalctl -u instabot --since "2026-05-01 09:00:00" --no-pager
```

---

## Update Instagram token

**Do this whenever the IG password changes or the token expires (~60 days).**

1. Generate a new Long-Lived Page Access Token (see `DEPLOY.md §9c`)
2. Edit the `.env` file:

```bash
nano /opt/instabot/backend/.env
# Update INSTAGRAM_PAGE_ACCESS_TOKEN=EAAnew...
```

3. Restart:

```bash
systemctl restart instabot
```

4. Verify connection:

```bash
journalctl -u instabot -n 20 --no-pager | grep "Graph API connected"
# Should show: Graph API connected: @your_account (ID: xxx)
```

---

## Database backup and restore

**Backup:**

```bash
cp $(find /opt/instabot -name "bot.db") /root/bot.db.backup.$(date +%Y%m%d)
```

**Restore:**

```bash
systemctl stop instabot
cp /root/bot.db.backup.20260501 $(find /opt/instabot -name "bot.db")
systemctl start instabot
```

**Inspect raw data:**

```bash
sqlite3 $(find /opt/instabot -name "bot.db")
.tables
SELECT * FROM system_settings;
SELECT count(*) FROM conversations;
SELECT count(*) FROM messages;
.quit
```

---

## Update the knowledge base

The knowledge base lives in `knowledge_base/*.md` files in the repo.

1. Edit the relevant file locally:
   - `system_prompt.md` — AI persona, conversation rules
   - `pricing.md` — pricing tiers
   - `coverage.md` — delivery coverage area
   - `sizes.md` — package size/weight limits
   - `schedule.md` — pickup and cutoff times

2. Push to GitHub:

```bash
git add knowledge_base/
git commit -m "Update knowledge base: ..."
git push
```

3. Pull on server and restart:

```bash
cd /opt/instabot && git pull && systemctl restart instabot
```

Changes take effect on the next `generate_reply` call — no DB migration needed.

---

## Manage AI model and API keys

Via the Settings UI at `https://instagrambot.live/settings`:

- **AI 模型** — select from dropdown or enter a custom model ID
- **API Key** — fill in the key for the selected provider; saved to DB on blur (click away from the field)

Keys stored in DB take priority over `.env` values. No restart needed after changing keys via the UI.

---

## Manage manager preferences

Manager preferences are long-term style rules the AI learns from your prompt hints (e.g. "少用感叹号").

**View / disable / delete** in Settings UI → 管理者偏好

**Manual add via DB:**

```bash
sqlite3 $(find /opt/instabot -name "bot.db") \
  "INSERT INTO manager_preferences (content, source_prompt, is_active) VALUES ('回复不超过3句话', 'manual', 1);"
```

**Clear all preferences:**

```bash
sqlite3 $(find /opt/instabot -name "bot.db") "DELETE FROM manager_preferences;"
```

---

## Backfill missing comment permalinks

If comment events are missing their post links (shows "帖子链接获取中..."):

```bash
curl -X POST https://instagrambot.live/api/comments/backfill-permalinks \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Or trigger from the Comments inbox UI → click the retry button on any affected row.

---

## Common errors

| Error | Cause | Fix |
|-------|-------|-----|
| `OAuthException code 190` | Page Access Token expired or invalid | Regenerate token → update `.env` → restart |
| `Send DM failed (403): outside of allowed window` | Customer hasn't messaged in >24 h | Meta limitation — cannot send first; wait for customer to message |
| `Send DM failed (400): Link can't be shared` | Account temporarily restricted from sending links | Check Instagram Account Status; wait 1–3 days for auto-lift |
| `ModuleNotFoundError: No module named 'openai'` | Dependency not installed | `cd /opt/instabot/backend && venv/bin/pip install openai` |
| `AuthenticationError: Incorrect API key` | Wrong key in DB or autofill overwrote it | Go to Settings → re-enter correct API key → click outside field to save |
| `connect() failed (111)` in nginx log | Backend not running | `systemctl start instabot` |
| Avatar not showing (text initials instead) | Profile pic fetch failed; 30-min cooldown active | Wait 30 min, then reload the page |
| `RateLimitError 429` from AI provider | API quota exceeded | Wait for quota reset or upgrade plan |
| `ig_client unavailable` | Service not started or token not configured | Check `systemctl status instabot`; verify token in `.env` |
| `500 Internal Server Error` on generate-reply | Usually an AI API error | Check `journalctl -u instabot -f`, click generate again to see error |

---

## Self-check commands

```bash
# Is the backend running?
systemctl status instabot

# Is nginx running?
systemctl status nginx

# Is the API healthy?
curl https://instagrambot.live/api/health

# Is Instagram connected?
journalctl -u instabot -n 50 --no-pager | grep "Graph API"

# What model is active?
sqlite3 $(find /opt/instabot -name "bot.db") \
  "SELECT key, value FROM system_settings WHERE key IN ('ai_model','ai_model_provider');"

# How many conversations in DB?
sqlite3 $(find /opt/instabot -name "bot.db") \
  "SELECT count(*) FROM conversations; SELECT count(*) FROM messages;"
```

---

## Debug tips

**Browser (F12):**
- **Console** tab — JavaScript errors appear here. Red errors on button clicks mean the frontend threw before sending a request.
- **Network** tab → filter by `api/` — shows every REST call, status code, and response body. Click a failed request → **Response** to see the server's error JSON.

**Server:**
```bash
# Watch logs in real time while reproducing the issue
journalctl -u instabot -f

# Check nginx errors (proxy failures, SSL issues)
tail -50 /var/log/nginx/error.log
```
