#!/bin/bash
set -e

# ============================================================
# InstaBot Deployment Script
# Run as root: bash /opt/instabot/deploy/setup.sh
# ============================================================

APP_DIR="/opt/instabot"
DOMAIN="instagrambot.live"

echo "========================================="
echo "  InstaBot Deployment"
echo "========================================="

# --- 1. System packages ---
echo ""
echo "[1/7] Installing system packages..."
apt-get update -qq
apt-get install -y -qq nginx certbot python3-certbot-nginx python3-venv python3-pip git curl

# --- 2. Node.js 20 (if not installed) ---
echo ""
echo "[2/7] Setting up Node.js..."
if ! command -v node &> /dev/null || [[ $(node -v | cut -d. -f1 | tr -d v) -lt 20 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y -qq nodejs
fi
echo "Node.js: $(node -v)"

# --- 3. Create instabot user ---
echo ""
echo "[3/7] Creating instabot user..."
if ! id -u instabot &>/dev/null; then
    useradd -r -m -s /bin/bash instabot
fi

# --- 4. Clone or update repo ---
echo ""
echo "[4/7] Setting up application..."
if [ -d "$APP_DIR/.git" ]; then
    cd "$APP_DIR"
    git pull
else
    git clone https://github.com/WeilisAdventure/InstagramBot.git "$APP_DIR"
fi
chown -R instabot:instabot "$APP_DIR"

# --- 5. Python backend ---
echo ""
echo "[5/7] Setting up Python backend..."
cd "$APP_DIR/backend"
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
venv/bin/pip install -q --upgrade pip
venv/bin/pip install -q .

# Create .env if not exists
if [ ! -f ".env" ]; then
    cp .env.example .env 2>/dev/null || true
    echo ""
    echo "⚠️  Please edit /opt/instabot/backend/.env with your settings!"
fi
chown -R instabot:instabot "$APP_DIR/backend"

# --- 6. Frontend build ---
echo ""
echo "[6/7] Building frontend..."
cd "$APP_DIR/frontend"
npm install --silent
npm run build

# --- 7. Nginx + SSL + systemd ---
echo ""
echo "[7/7] Configuring Nginx, SSL, and systemd..."

# Nginx config (HTTP only first, for certbot)
cat > /etc/nginx/sites-available/instabot << 'NGINX'
server {
    listen 80;
    server_name instagrambot.live;

    client_max_body_size 10m;

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 60s;
    }

    location /webhook {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /privacy {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        root /opt/instabot/frontend/dist;
        try_files $uri $uri/ /index.html;

        location ~* \.(js|css|svg|png|jpg|ico)$ {
            expires 7d;
            add_header Cache-Control "public, immutable";
        }
    }
}
NGINX

# Enable site, disable default
ln -sf /etc/nginx/sites-available/instabot /etc/nginx/sites-enabled/instabot
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# SSL certificate
echo ""
echo "Requesting SSL certificate..."
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email || {
    echo "⚠️  Certbot failed. Make sure DNS A record points to this server."
    echo "   You can retry later: certbot --nginx -d $DOMAIN"
}

# Systemd service
cp "$APP_DIR/deploy/instabot.service" /etc/systemd/system/instabot.service
systemctl daemon-reload
systemctl enable instabot
systemctl restart instabot

echo ""
echo "========================================="
echo "  Deployment complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "  1. Edit .env:    nano /opt/instabot/backend/.env"
echo "     - Set ADMIN_PASSWORD (change from admin123!)"
echo "     - Set AUTH_SECRET_KEY (random string)"
echo "     - Set ANTHROPIC_API_KEY"
echo "     - Set Instagram tokens"
echo "  2. Restart:      sudo systemctl restart instabot"
echo "  3. Check status: sudo systemctl status instabot"
echo "  4. View logs:    sudo journalctl -u instabot -f"
echo "  5. Open browser: https://$DOMAIN"
echo ""
echo "  Firewall: Make sure ports 80 and 443 are open!"
echo ""
