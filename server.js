import express from 'express';
import { Bot, InlineKeyboard } from 'grammy';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 10000);
const BOT_TOKEN = process.env.BOT_TOKEN;
const APP_URL = (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

// Отдаём публичные файлы Mini App без длительного кеширования: Telegram WebView
// иначе может продолжать показывать старый JS после нового деплоя.
const staticOptions = {
  fallthrough: false,
  etag: true,
  lastModified: true,
  maxAge: 0,
  setHeaders(res) { res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate'); }
};
app.use('/js', express.static(path.join(__dirname, 'js'), staticOptions));
app.use('/css', express.static(path.join(__dirname, 'css'), staticOptions));
app.use('/assets', express.static(path.join(__dirname, 'assets'), staticOptions));

app.get('/', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, app: 'Vampire Dominion', botConfigured: Boolean(BOT_TOKEN) });
});

// Проверка подлинности Telegram Mini App initData на сервере.
// BOT_TOKEN никогда не отправляется в браузер.
function verifyTelegramInitData(initData, maxAgeSeconds = 86400) {
  if (!BOT_TOKEN || typeof initData !== 'string' || !initData) return null;

  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) return null;

  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest();
  const received = Buffer.from(receivedHash, 'hex');
  if (received.length !== calculatedHash.length || !crypto.timingSafeEqual(received, calculatedHash)) return null;

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || Math.abs(Date.now() / 1000 - authDate) > maxAgeSeconds) return null;

  try {
    const user = JSON.parse(params.get('user') || 'null');
    if (!user || !Number.isSafeInteger(user.id)) return null;
    return { id: user.id, first_name: user.first_name || '', last_name: user.last_name || '', username: user.username || '', language_code: user.language_code || '' };
  } catch {
    return null;
  }
}

app.post('/api/auth', (req, res) => {
  const user = verifyTelegramInitData(req.body?.initData);
  if (!user) return res.status(401).json({ ok: false, error: 'Invalid Telegram initData' });
  return res.json({ ok: true, user });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Vampire Dominion web server listening on ${PORT}`);
});

if (!BOT_TOKEN) {
  console.warn('BOT_TOKEN is not set. Web app is running, but Telegram bot is disabled.');
} else if (!APP_URL) {
  console.error('APP_URL / RENDER_EXTERNAL_URL is missing. Set the public Render URL.');
} else {
  const bot = new Bot(BOT_TOKEN);
  const keyboard = new InlineKeyboard().webApp('🩸 Открыть Vampire Dominion', APP_URL);

  bot.command('start', async (ctx) => {
    await ctx.reply(
      'Добро пожаловать в «Хроники Наследия»! 🩸\n\nОткройте калькулятор и управляйте своей Цитаделью.',
      { reply_markup: keyboard }
    );
  });

  bot.command('help', async (ctx) => {
    await ctx.reply('Нажмите кнопку ниже, чтобы открыть Vampire Dominion.', { reply_markup: keyboard });
  });

  bot.catch((error) => console.error('Telegram bot error:', error));
  bot.api.setChatMenuButton({
    menu_button: { type: 'web_app', text: 'Открыть Цитадель', web_app: { url: APP_URL } }
  }).catch((error) => console.error('Could not set Telegram menu button:', error));

  bot.api.setMyCommands([
    { command: 'start', description: 'Открыть Vampire Dominion' },
    { command: 'help', description: 'Помощь' }
  ]).catch((error) => console.error('Could not set bot commands:', error));

  bot.start({
    onStart: (info) => console.log(`Telegram bot @${info.username} started (long polling)`)
  }).catch((error) => {
    console.error('Telegram bot failed to start:', error);
    server.close(() => process.exit(1));
  });
}

process.on('SIGTERM', () => {
  console.log('SIGTERM received; shutting down.');
  server.close(() => process.exit(0));
});
