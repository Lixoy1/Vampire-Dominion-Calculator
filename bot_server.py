#!/usr/bin/env python3
"""Serve the static calculator and handle Telegram /start via a webhook.

The bot token is read only from Render environment variables. Supported names:
BOT_TOKEN, TELEGRAM_BOT_TOKEN, or BOTFATHER_TOKEN.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
import urllib.error
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get("PORT", "8080"))
BOT_TOKEN = (
    os.environ.get("BOT_TOKEN")
    or os.environ.get("TELEGRAM_BOT_TOKEN")
    or os.environ.get("BOTFATHER_TOKEN")
)
WEB_APP_URL = "https://vampire-dominion-calculator-1.onrender.com"
WELCOME_TEXT = (
    "Добро пожаловать в «Хроники Наследия»! 🩸\n\n"
    "Откройте калькулятор и управляйте своей Цитаделью. "
    "Планируйте развитие, рассчитывайте ресурсы и следите за прогрессом."
)
WEBHOOK_PATH = "/telegram/webhook"
WEBHOOK_SECRET = hashlib.sha256(BOT_TOKEN.encode("utf-8")).hexdigest()[:40] if BOT_TOKEN else None

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("vampire-dominion-bot")


def telegram_api(method: str, payload: dict) -> dict:
    if not BOT_TOKEN:
        raise RuntimeError("Telegram bot token is not configured")
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/{method}"
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        result = json.loads(response.read().decode("utf-8"))
    if not result.get("ok"):
        raise RuntimeError(f"Telegram API {method} failed: {result}")
    return result


def send_welcome(chat_id: int) -> None:
    telegram_api(
        "sendMessage",
        {
            "chat_id": chat_id,
            "text": WELCOME_TEXT,
            "reply_markup": {
                "inline_keyboard": [
                    [
                        {
                            "text": "🩸 Открыть Vampire Dominion",
                            "web_app": {"url": WEB_APP_URL},
                        }
                    ]
                ]
            },
        },
    )


def configure_telegram() -> None:
    if not BOT_TOKEN:
        log.warning(
            "No bot token found. Static site and health endpoint will work, "
            "but /start webhook is disabled. Set BOT_TOKEN in Render Environment."
        )
        return
    external_url = os.environ.get(
        "RENDER_EXTERNAL_URL",
        "https://vampire-dominion-calculator.onrender.com",
    ).rstrip("/")
    webhook_url = external_url + WEBHOOK_PATH
    try:
        telegram_api(
            "setWebhook",
            {
                "url": webhook_url,
                "secret_token": WEBHOOK_SECRET,
                "allowed_updates": ["message"],
                "drop_pending_updates": False,
            },
        )
        telegram_api(
            "setChatMenuButton",
            {
                "menu_button": {
                    "type": "web_app",
                    "text": "Открыть Цитадель",
                    "web_app": {"url": WEB_APP_URL},
                }
            },
        )
        log.info("Telegram webhook configured at %s", webhook_url)
    except Exception:
        log.exception("Could not configure Telegram webhook")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        if self.path.rstrip("/") == "/api/health":
            body = json.dumps({"status": "ok"}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        return super().do_GET()

    def do_POST(self):
        if urllib.parse.urlsplit(self.path).path != WEBHOOK_PATH:
            self.send_error(404)
            return
        if not BOT_TOKEN:
            self.send_error(503, "Telegram bot is not configured")
            return
        supplied_secret = self.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
        if not supplied_secret or supplied_secret != WEBHOOK_SECRET:
            self.send_error(403)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 1024 * 1024:
                self.send_error(400)
                return
            update = json.loads(self.rfile.read(length).decode("utf-8"))
            message = update.get("message") or {}
            text = (message.get("text") or "").strip()
            chat = message.get("chat") or {}
            chat_id = chat.get("id")
            if chat_id and text.split(" ", 1)[0].split("@", 1)[0] == "/start":
                send_welcome(chat_id)
                log.info("Sent /start welcome to chat %s", chat_id)
            self.send_response(200)
            self.send_header("Content-Length", "0")
            self.end_headers()
        except Exception:
            log.exception("Failed to process Telegram update")
            # Acknowledge malformed or failed updates to avoid an endless retry loop.
            self.send_response(200)
            self.send_header("Content-Length", "0")
            self.end_headers()


if __name__ == "__main__":
    os.chdir(ROOT)
    if BOT_TOKEN:
        threading.Thread(target=configure_telegram, name="telegram-setup", daemon=True).start()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    log.info("Vampire Dominion web + Telegram service listening on port %s", PORT)
    server.serve_forever()
