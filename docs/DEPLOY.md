# Deployment Guide

Zero-to-server guide for a fresh Ubuntu 22.04 VPS.

---

## 1. Server requirements

| Item | Minimum |
|------|---------|
| OS | Ubuntu 22.04 LTS |
| RAM | 1 GB |
| Disk | 10 GB |
| CPU | 1 vCPU |
| Ports | 80, 443 (HTTP/HTTPS), 22 (SSH) |

---

## 2. Install system dependencies

```bash
apt update && apt upgrade -y
apt install -y python3.11 python3.11-venv python3-pip nodejs npm nginx certbot python3-certbot-nginx git sqlite3
```

---

## 3. Clone the repo

```bash
cd /opt
git clone https://github.com/WeilisAdventure/InstagramBot.git instabot
cd instabot
```

---

## 4. Backend setup

```bash
cd /opt/instabot/backend

# Create virtualenv and install dependencies
python3.11 -m venv venv
venv/bin/pip install -e ".[dev]"

# Create environment file
cp .env.example .env   # or create from scratch — see CONFIG.md
nano .env              # fill in your values
```

Minimal `.env` for production:

```env
IG_MODE=graph_api
INSTAGRAM_PAGE_ACCESS_TOKEN=EAAxxxxxxx
INSTAGRAM_APP_SECRET=your_app_secret
INSTAGRAM_VERIFY_TOKEN=any_random_string
INSTAGRAM_ACCOUNT_ID=your_ig_account_id

ADMIN_PASSWORD=your_strong_password
AUTH_SECRET_KEY=a_long_random_secret_string
LOG_LEVEL=INFO
```

---

## 5. Systemd service

Create `/etc/systemd/system/instabot.service`:

```ini
[Unit]
Description=InstaBot FastAPI Backend
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/instabot/backend
ExecStart=/opt/instabot/backend/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
systemctl daemon-reload
systemctl enable instabot
systemctl start instabot
systemctl status instabot   # should show "active (running)"
```

The first start creates `bot.db` automatically via `init_db()`.

---

## 6. Frontend build

```bash
cd /opt/instabot/frontend
npm install
npm run build
# Output goes to frontend/dist/
```

---

## 7. Nginx configuration

Create `/etc/nginx/sites-available/instabot`:

```nginx
server {
    listen 80;
    server_name instagrambot.live;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name instagrambot.live;

    ssl_certificate     /etc/letsencrypt/live/instagrambot.live/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/instagrambot.live/privkey.pem;

    # Frontend static files
    root /opt/instabot/frontend/dist;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend API + webhooks
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    location /webhook {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable and test:

```bash
ln -s /etc/nginx/sites-available/instabot /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

---

## 8. HTTPS with Certbot

```bash
certbot --nginx -d instagrambot.live
# Follow prompts — certbot patches the nginx config automatically
systemctl reload nginx
```

Auto-renewal is handled by the certbot systemd timer installed automatically.

---

## 9. Meta App configuration

### 9a. Create a Meta App

1. Go to [developers.facebook.com/apps](https://developers.facebook.com/apps) → **Create App**
2. Choose **Business** type
3. Add the **Instagram** product

### 9b. Configure webhook

1. In your app → **Instagram** → **Webhooks**
2. Callback URL: `https://instagrambot.live/webhook`
3. Verify Token: same string you set as `INSTAGRAM_VERIFY_TOKEN` in `.env`
4. Subscribe to: `messages`, `comments`

### 9c. Generate a Page Access Token

1. **Instagram** → **API Setup with Instagram Login** (or Basic Display)
2. Generate a User Access Token with these permissions:
   - `instagram_basic`
   - `instagram_manage_messages`
   - `instagram_manage_comments`
   - `pages_messaging`
3. Exchange for a **Long-Lived Token** (valid 60 days):

```bash
curl "https://graph.facebook.com/oauth/access_token?
  grant_type=fb_exchange_token&
  client_id=YOUR_APP_ID&
  client_secret=YOUR_APP_SECRET&
  fb_exchange_token=SHORT_LIVED_TOKEN"
```

4. Set `INSTAGRAM_PAGE_ACCESS_TOKEN` to the long-lived token in `.env`
5. Restart the service: `systemctl restart instabot`

### 9d. Get your Account ID

```bash
curl "https://graph.instagram.com/v21.0/me?fields=id,username&access_token=YOUR_TOKEN"
```

Set the `id` value as `INSTAGRAM_ACCOUNT_ID`.

---

## 10. Verify everything works

```bash
# Backend health
curl https://instagrambot.live/api/health

# Check logs
journalctl -u instabot -n 50 --no-pager

# Test webhook endpoint (Meta sends a GET to verify)
curl "https://instagrambot.live/webhook?hub.mode=subscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=test123"
# Should return: test123
```

Open `https://instagrambot.live` in your browser and log in with `ADMIN_PASSWORD`.

---

## 11. Updating the app

```bash
cd /opt/instabot
git pull

# If backend dependencies changed
cd backend && venv/bin/pip install -e . && cd ..

# If frontend changed
cd frontend && npm run build && cd ..

systemctl restart instabot
```
