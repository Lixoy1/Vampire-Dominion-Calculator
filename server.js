import express from 'express';
import { Bot, InlineKeyboard } from 'grammy';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculateOracle, autoDistributeAll, autoDistributeConclave, autoDistributeTalentPlan, autoDistributePresencePlan, autoDistributeBondPlan, commitOraclePlan, summonWarden, summonLover, importDhampirSnapshot, getOracleCapabilities } from './oracle.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 10000);
const BOT_TOKEN = process.env.BOT_TOKEN;
const APP_URL = (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '256kb' }));

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
  res.json({ ok: true, app: 'Vampire Dominion', botConfigured: Boolean(BOT_TOKEN), oracle: getOracleCapabilities() });
});

// Oracle API is stateless: it calculates only from values entered by the player.
// It does not authenticate with, scrape, or call Game of Vampires.
const oracleRateWindows = new Map();
function oracleRateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const current = oracleRateWindows.get(key);
  if (!current || now - current.startedAt >= 60_000) {
    oracleRateWindows.set(key, { startedAt: now, count: 1 });
    return next();
  }
  current.count += 1;
  if (current.count > 120) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ ok: false, error: { code: 'RATE_LIMITED', message: 'Слишком много расчётов. Повтори запрос через минуту.' } });
  }
  return next();
}

function oracleInput(req) {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    const error = new Error('Ожидается JSON-объект с account и plan.');
    error.status = 400;
    throw error;
  }
  if (!req.body.account || typeof req.body.account !== 'object' || Array.isArray(req.body.account)) {
    const error = new Error('В запросе отсутствуют данные аккаунта.');
    error.status = 400;
    throw error;
  }
  const serialized = JSON.stringify(req.body);
  if (serialized.length > 240_000) {
    const error = new Error('Профиль слишком большой для одного расчёта.');
    error.status = 413;
    throw error;
  }
  return req.body;
}

function oracleEndpoint(handler) {
  return (req, res) => {
    try {
      const input = oracleInput(req);
      const result = handler(input);
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ ok: true, result });
    } catch (error) {
      const status = error.status || 500;
      if (status >= 500) console.error('Oracle request failed:', error);
      return res.status(status).json({
        ok: false,
        error: {
          code: status >= 500 ? 'ORACLE_FAILURE' : 'INVALID_INPUT',
          message: status >= 500 ? 'Oracle не смог выполнить расчёт. Данные профиля не изменены.' : error.message,
        },
      });
    }
  };
}

app.get('/api/oracle/meta', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true, result: getOracleCapabilities() });
});
app.post('/api/oracle/calculate', oracleRateLimit, oracleEndpoint(calculateOracle));
app.post('/api/oracle/auto-distribute', oracleRateLimit, oracleEndpoint(autoDistributeAll));
app.post('/api/oracle/auto-conclave', oracleRateLimit, oracleEndpoint(autoDistributeConclave));
app.post('/api/oracle/auto-talents', oracleRateLimit, oracleEndpoint(autoDistributeTalentPlan));
app.post('/api/oracle/auto-presences', oracleRateLimit, oracleEndpoint(autoDistributePresencePlan));
app.post('/api/oracle/auto-bonds', oracleRateLimit, oracleEndpoint(autoDistributeBondPlan));
app.post('/api/oracle/commit-plan', oracleRateLimit, oracleEndpoint(commitOraclePlan));
app.post('/api/oracle/summon', oracleRateLimit, oracleEndpoint(summonWarden));
app.post('/api/oracle/summon-lover', oracleRateLimit, oracleEndpoint(summonLover));
app.post('/api/oracle/import-helper', oracleRateLimit, oracleEndpoint(importDhampirSnapshot));

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
