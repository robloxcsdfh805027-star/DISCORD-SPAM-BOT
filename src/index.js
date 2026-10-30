const DISCORD_API = "https://discord.com/api/v10";
const MAX_MESSAGE_LENGTH = 2000;
const SEND_INTERVAL_MS = 2000;

function fromHex(hex) {
  if (!/^[0-9a-f]{128}$/i.test(hex)) throw new Error("Invalid Discord public key");
  const bytes = new Uint8Array(64);
  for (let i = 0; i < 64; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

async function verifyDiscordRequest(request, rawBody, publicKeyHex) {
  const signature = request.headers.get("X-Signature-Ed25519");
  const timestamp = request.headers.get("X-Signature-Timestamp");
  if (!signature || !timestamp || !/^[0-9a-f]{128}$/i.test(signature)) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    fromHex(publicKeyHex),
    { name: "Ed25519" },
    false,
    ["verify"]
  );
  const message = new TextEncoder().encode(timestamp + rawBody);
  const sig = fromHex(signature);
  return crypto.subtle.verify({ name: "Ed25519" }, key, sig, message);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function isModerator(interaction) {
  const permissions = BigInt(interaction.member?.permissions ?? "0");
  const ADMINISTRATOR = 1n << 3n;
  const MANAGE_GUILD = 1n << 5n;
  return (permissions & (ADMINISTRATOR | MANAGE_GUILD)) !== 0n;
}

function getMessages(interaction) {
  const subcommand = interaction.data?.options?.find((option) => option.type === 1 && option.name === "announce");
  if (!subcommand) return null;
  const options = Object.fromEntries((subcommand.options ?? []).map((option) => [option.name, option.value]));
  const messages = [1, 2, 3, 4, 5].map((n) => options[`message${n}`]);
  if (messages.some((message) => typeof message !== "string" || !message.trim() || message.length > MAX_MESSAGE_LENGTH)) {
    return null;
  }
  return messages.map((message) => message.trim());
}

async function sendAnnouncement(channelId, messages, botToken) {
  for (let index = 0; index < messages.length; index++) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, SEND_INTERVAL_MS));
    const response = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: messages[index],
        allowed_mentions: { parse: [] },
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error("Discord message send failed", response.status, detail.slice(0, 500));
      break;
    }
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
    if (!env.DISCORD_PUBLIC_KEY || !env.DISCORD_BOT_TOKEN) {
      return new Response("Worker secrets are not configured", { status: 500 });
    }

    const rawBody = await request.text();
    let valid = false;
    try {
      valid = await verifyDiscordRequest(request, rawBody, env.DISCORD_PUBLIC_KEY);
    } catch (error) {
      console.error("Signature verification error", error);
    }
    if (!valid) return new Response("Invalid request signature", { status: 401 });

    let interaction;
    try {
      interaction = JSON.parse(rawBody);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    if (interaction.type === 1) return json({ type: 1 });
    if (interaction.type !== 2 || interaction.data?.name !== "custom") {
      return json({ type: 4, data: { content: "不支援的指令。", flags: 64 } });
    }

    if (!isModerator(interaction)) {
      return json({ type: 4, data: { content: "只有伺服器管理員或具備管理伺服器權限的人可以使用公告指令。", flags: 64 } });
    }

    const messages = getMessages(interaction);
    if (!messages) {
      return json({ type: 4, data: { content: "請提供完整的 5 則訊息；每則需為 1–2000 字元。", flags: 64 } });
    }

    const channelId = interaction.channel_id;
    if (!channelId) {
      return json({ type: 4, data: { content: "請在伺服器文字頻道中使用此指令。", flags: 64 } });
    }

    ctx.waitUntil(sendAnnouncement(channelId, messages, env.DISCORD_BOT_TOKEN));
    return json({
      type: 5,
      data: {
        flags: 64,
      },
    });
  },
};
