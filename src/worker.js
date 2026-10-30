const DISCORD_API = "https://discord.com/api/v10";
const MAX_MESSAGE_LENGTH = 1800;
const SEND_INTERVAL_MS = 2000;

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

async function sendFiveMessages(env, channelId, messages) {
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

    const permissions = BigInt(interaction.member?.permissions ?? "0");
    const ADMINISTRATOR = 1n << 3n;
    const MANAGE_GUILD = 1n << 5n;
    if ((permissions & (ADMINISTRATOR | MANAGE_GUILD)) === 0n) {
      return json({
        type: 4,
        data: { content: "只有具備管理伺服器或管理員權限的人可以使用此公告指令。", flags: 64 },
      });
    }

    const options = command.options[0].options ?? [];
    const messages = [1, 2, 3, 4, 5].map((number) =>
      options.find((option) => option.name === `message${number}`)?.value?.trim() ?? "",
    );

    if (messages.some((message) => !message || message.length > MAX_MESSAGE_LENGTH)) {
      return json({
        type: 4,
        data: {
          content: "請提供 5 則非空訊息，每則最多 1800 個字元。",
          flags: 64,
        },
      });
    }

    const channelId = interaction.channel_id;
    if (!channelId || !env.DISCORD_BOT_TOKEN) {
      return json({
        type: 4,
        data: { content: "機器人設定不完整，請通知伺服器管理員。", flags: 64 },
      });
    }

    ctx.waitUntil(sendFiveMessages(env, channelId, messages));
    return json({
      type: 4,
      data: {
        content: "已開始依序發布 5 則公告。訊息會以機器人帳號顯示。",
        flags: 64,
      },
    });
  },
};
