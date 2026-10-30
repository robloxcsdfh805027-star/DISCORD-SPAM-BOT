const DISCORD_API = "https://discord.com/api/v10";
const MAX_MESSAGE_LENGTH = 1800;
const SEND_INTERVAL_MS = 2000;
const COOLDOWN_SECONDS = 60;

function hexToBytes(hex) {
  if (!/^[0-9a-f]{128}$/i.test(hex)) throw new Error("Invalid Discord public key");
  return Uint8Array.from(hex.match(/.{2}/g), (byte) => parseInt(byte, 16));
}

async function verifyDiscordRequest(request, rawBody, publicKeyHex) {
  const signature = request.headers.get("X-Signature-Ed25519");
  const timestamp = request.headers.get("X-Signature-Timestamp");
  if (!signature || !timestamp || !publicKeyHex) return false;
  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > 300) return false;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      hexToBytes(publicKeyHex),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    const message = new TextEncoder().encode(timestamp + rawBody);
    const signatureBytes = Uint8Array.from(
      signature.match(/.{2}/g) ?? [],
      (byte) => parseInt(byte, 16),
    );
    if (signatureBytes.length !== 64) return false;
    return await crypto.subtle.verify("Ed25519", key, signatureBytes, message);
  } catch {
    return false;
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendMessages(env, channelId, messages) {
  for (let index = 0; index < messages.length; index += 1) {
    if (index > 0) await sleep(SEND_INTERVAL_MS);
    const response = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: messages[index],
        allowed_mentions: { parse: [] },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("Discord message send failed", response.status, detail);
      break;
    }
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") return new Response("Not found", { status: 404 });

    const rawBody = await request.text();
    const valid = await verifyDiscordRequest(request, rawBody, env.DISCORD_PUBLIC_KEY);
    if (!valid) return new Response("Invalid request signature", { status: 401 });

    let interaction;
    try {
      interaction = JSON.parse(rawBody);
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    if (interaction.type === 1) return json({ type: 1 });
    if (interaction.type !== 2) return json({ error: "Unsupported interaction" }, 400);

    const command = interaction.data;
    if (command.name !== "custom" || command.options?.[0]?.name !== "spam") {
      return json({
        type: 4,
        data: { content: "未知指令。請使用 /custom spam。", flags: 64 },
      });
    }

    const options = command.options[0].options ?? [];
    const count = options.find((option) => option.name === "count")?.value;
    if (!Number.isInteger(count) || count < 1 || count > 5) {
      return json({ type: 4, data: { content: "請選擇 1 到 5 則訊息。", flags: 64 } });
    }

    const messages = Array.from({ length: count }, (_, index) =>
      options.find((option) => option.name === `message${index + 1}`)?.value?.trim() ?? "",
    );
    if (messages.some((message) => !message || message.length > MAX_MESSAGE_LENGTH)) {
      return json({
        type: 4,
        data: { content: `你選擇發送 ${count} 則，請填寫前 ${count} 個訊息欄位；每則最多 1800 個字元。`, flags: 64 },
      });
    }
    const channelId = interaction.channel_id;
    if (!channelId || !env.DISCORD_BOT_TOKEN) {
      return json({
        type: 4,
        data: { content: "機器人設定不完整，請通知伺服器管理員。", flags: 64 },
      });
    }

    const userId = interaction.member?.user?.id ?? interaction.user?.id;
    const guildId = interaction.guild_id;
    if (!userId || !guildId) {
      return json({ type: 4, data: { content: "此指令只能在伺服器文字頻道使用。", flags: 64 } });
    }

    const cooldownRequest = new Request("https://cooldown.discord-custom-announcements/" + guildId + "/" + userId);
    const cache = caches.default;
    if (await cache.match(cooldownRequest)) {
      return json({ type: 4, data: { content: "你剛剛已使用過公告功能，請等 60 秒再試。", flags: 64 } });
    }
    await cache.put(cooldownRequest, new Response("cooldown", {
      headers: { "Cache-Control": `max-age=${COOLDOWN_SECONDS}` },
    }));

    ctx.waitUntil(sendMessages(env, channelId, messages));
    return json({
      type: 4,
      data: { content: `已開始依序發布 ${count} 則訊息。訊息會以機器人帳號顯示。`, flags: 64 },
    });
  },
};
