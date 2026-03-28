"""
One-command startup: ngrok (fixed domain) + uvicorn backend.
Usage: python start.py
"""
import subprocess
import sys
from pyngrok import ngrok

NGROK_DOMAIN = "nonpermeative-execratively-elly.ngrok-free.dev"
BACKEND_DIR = "backend"
PORT = 8000

print(f"Starting ngrok tunnel → https://{NGROK_DOMAIN}")
tunnel = ngrok.connect(PORT, "http", domain=NGROK_DOMAIN)
print(f"Webhook URL: {tunnel.public_url}/webhook")
print()

print("Starting backend server...")
subprocess.run(
    [sys.executable, "-m", "uvicorn", "app.main:app", "--reload", "--port", str(PORT)],
    cwd=BACKEND_DIR,
)
