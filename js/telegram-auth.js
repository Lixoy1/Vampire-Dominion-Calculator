import crypto from 'node:crypto';

/**
 * Validate Telegram Mini App initData using the bot token.
 * The bot token must remain on the server and must never be sent to the client.
 */
export function verifyTelegramInitData(
  initData,
  botToken,
  {
    nowSeconds = Date.now() / 1000,
    maxAgeSeconds = 86400,
    allowedFutureSkewSeconds = 60,
  } = {}
) {
  if (typeof botToken !== 'string' || !botToken.trim()) return null;
  if (typeof initData !== 'string' || !initData || initData.length > 32_768) return null;

  let params;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return null;
  }

  const entries = [...params.entries()];
  const seen = new Set();
  for (const [key] of entries) {
    if (seen.has(key)) return null;
    seen.add(key);
  }

  const receivedHash = params.get('hash');
  if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) return null;

  const authDateRaw = params.get('auth_date');
  if (!authDateRaw || !/^\d+$/.test(authDateRaw)) return null;
  const authDate = Number(authDateRaw);
  if (!Number.isSafeInteger(authDate) || !Number.isFinite(nowSeconds)) return null;

  const ageSeconds = nowSeconds - authDate;
  if (ageSeconds < -allowedFutureSkewSeconds || ageSeconds > maxAgeSeconds) return null;

  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest();
  const received = Buffer.from(receivedHash, 'hex');
  if (received.length !== calculatedHash.length || !crypto.timingSafeEqual(received, calculatedHash)) return null;

  try {
    const user = JSON.parse(params.get('user') || 'null');
    if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) return null;
    return {
      id: user.id,
      first_name: typeof user.first_name === 'string' ? user.first_name : '',
      last_name: typeof user.last_name === 'string' ? user.last_name : '',
      username: typeof user.username === 'string' ? user.username : '',
      language_code: typeof user.language_code === 'string' ? user.language_code : '',
    };
  } catch {
    return null;
  }
}
