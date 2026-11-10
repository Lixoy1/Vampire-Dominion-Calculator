import express from 'express';
import { Bot, InlineKeyboard } from 'grammy';
import { verifyTelegramInitData } from './js/telegram-auth.js';
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
  res.json({ ok: true, app: 'Наследие вампиров', botConfigured: Boolean(BOT_TOKEN) });
});

// BOT_TOKEN остаётся на сервере; проверка вынесена в тестируемый модуль.

app.post('/api/auth', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const user = verifyTelegramInitData(req.body?.initData, BOT_TOKEN);
  if (!user) return res.status(401).json({ ok: false, error: 'Invalid Telegram initData' });
  return res.json({ ok: true, user });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Наследие вампиров server listening on ${PORT}`);
});

if (!BOT_TOKEN) {
  console.warn('BOT_TOKEN is not set. Web app is running, but Telegram bot is disabled.');
} else if (!APP_URL) {
  console.error('APP_URL / RENDER_EXTERNAL_URL is missing. Set the public Render URL.');
} else {
  const bot = new Bot(BOT_TOKEN);
  const keyboard = new InlineKeyboard().webApp('🩸 Открыть Наследие', APP_URL);

  bot.command('start', async (ctx) => {
    await ctx.reply(
      'Добро пожаловать в «Наследие вампиров»! 🩸\n\nОткройте бесплатный калькулятор и управляйте своей Цитаделью.',
      { reply_markup: keyboard }
    );
  });

  bot.command('open', async (ctx) => {
    await ctx.reply('🩸 Открываем «Наследие вампиров».', { reply_markup: keyboard });
  });

  bot.command('help', async (ctx) => {
    await ctx.reply('«Наследие вампиров» — бесплатный калькулятор и помощник. Нажмите кнопку ниже, чтобы открыть Цитадель.', { reply_markup: keyboard });
  });

  bot.catch((error) => console.error('Telegram bot error:', error));
  bot.api.setChatMenuButton({
    menu_button: { type: 'web_app', text: 'Открыть Цитадель', web_app: { url: APP_URL } }
  }).catch((error) => console.error('Could not set Telegram menu button:', error));

  bot.api.setMyCommands([
    { command: 'start', description: 'Открыть Наследие вампиров' },
    { command: 'open', description: 'Открыть Цитадель' },
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
