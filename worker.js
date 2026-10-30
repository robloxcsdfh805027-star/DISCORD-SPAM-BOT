const API = "https://discord.com/api/v10";
const COOLDOWN_MS = 30_000;
const SEND_COUNT = 5;
const SEND_INTERVAL_MS = 3_000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
function hexToBytes(hex) {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2) return new Uint8Array();
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}
async function verify(req, body, publicKey) {
  const signature = req.headers.get("X-Signature-Ed25519");
  const timestamp = req.headers.get("X-Signature-Timestamp");
  if (!signature || !timestamp || !publicKey) return false;
  try {
    const key = await crypto.subtle.importKey("raw", hexToBytes(publicKey), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", key, hexToBytes(signature), new TextEncoder().encode(timestamp + body));
  } catch { return false; }
}
const ephemeral = (content, components = []) => ({
  type: 4,
  data: { content, flags: 64, components, allowed_mentions: { parse: [] } },
});
const buttons = (id) => [{
  type: 1,
  components: [
    { type: 2, style: 3, label: "確認發布 5 則", custom_id: "publish_confirm:" + id },
    { type: 2, style: 2, label: "取消", custom_id: "publish_cancel:" + id },
  ],
}];
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function editOriginal(applicationId, token, content) {
  return fetch(API + "/webhooks/" + applicationId + "/" + token + "/messages/@original", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content, components: [], allowed_mentions: { parse: [] } }),
  });
}

async function publishFive(applicationId, token, content) {
  const endpoint = API + "/webhooks/" + applicationId + "/" + token;
  let sentCount = 0;
  try {
    for (let i = 0; i < SEND_COUNT; i++) {
      const sent = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
      });
      if (!sent.ok) throw new Error("Discord returned HTTP " + sent.status);
      sentCount++;
      if (i < SEND_COUNT - 1) await wait(SEND_INTERVAL_MS);
    }
    await editOriginal(applicationId, token, "已完成：成功發布 5 則公告。");
  } catch {
    await editOriginal(applicationId, token, "發布已停止：成功發布 " + sentCount + " / 5 則。請稍後再試，避免重複發送。");
  }
}

export default {
  async fetch(req, env, ctx) {
    if (req.method !== "POST") return new Response("Discord interactions endpoint", { status: 200 });
    const body = await req.text();
    if (!(await verify(req, body, env.DISCORD_PUBLIC_KEY))) return new Response("Invalid signature", { status: 401 });
    const interaction = JSON.parse(body);
    if (interaction.type === 1) return json({ type: 1 });

    const user = interaction.member?.user || interaction.user;
    if (!user?.id) return json(ephemeral("無法辨識使用者。"));

    if (interaction.type === 2) {
      const cmd = interaction.data;
      if (cmd.name !== "custom" || cmd.options?.[0]?.name !== "spam") return json(ephemeral("不支援的指令。"));
      return json({
        type: 9,
        data: {
          custom_id: "announcement_modal",
          title: "建立頻道公告",
          components: [{
            type: 1,
            components: [{
              type: 4, custom_id: "announcement_text", label: "公告內容",
              style: 2, min_length: 1, max_length: 500, required: true,
              placeholder: "輸入要發布的公告（最多 500 字）",
            }],
          }],
        },
      });
    }

    if (interaction.type === 5 && interaction.data.custom_id === "announcement_modal") {
      const fields = interaction.data.components.flatMap(row => row.components || []);
      const content = fields.find(x => x.custom_id === "announcement_text")?.value?.trim();
      if (!content || content.length > 500) return json(ephemeral("公告內容必須介於 1 到 500 個字元。"));
      const id = crypto.randomUUID();
      await env.RATE_LIMITS.put("pending:" + id, JSON.stringify({ content, userId: user.id }), { expirationTtl: 300 });
      return json({
        type: 4,
        data: {
          content: "請確認要在目前頻道連續發布 5 則相同公告：\n> " + content +
            "\n\n每則間隔 3 秒；每位使用者每 30 秒最多啟動一次。請只用於有授權的公告，避免造成頻道干擾。",
          flags: 64,
          components: buttons(id),
          allowed_mentions: { parse: [] },
        },
      });
    }

    if (interaction.type === 3) {
      const [action, id] = (interaction.data.custom_id || "").split(":");
      if (!id) return json(ephemeral("確認資訊無效，請重新輸入。"));
      const pendingKey = "pending:" + id;
      const raw = await env.RATE_LIMITS.get(pendingKey);
      if (!raw) return json(ephemeral("確認資訊已過期或已使用，請重新輸入。"));
      const pending = JSON.parse(raw);
      if (pending.userId !== user.id) return json(ephemeral("只有建立公告的人可以確認。"));
      if (action === "publish_cancel") {
        await env.RATE_LIMITS.delete(pendingKey);
        return json(ephemeral("已取消發布。"));
      }
      if (action !== "publish_confirm") return json(ephemeral("不支援的操作。"));

      const cooldownKey = "cooldown:" + user.id;
      const last = Number(await env.RATE_LIMITS.get(cooldownKey) || 0);
      const now = Date.now();
      if (now - last < COOLDOWN_MS) return json(ephemeral("你操作得太頻繁，請等待冷卻時間結束後再試。"));
      await env.RATE_LIMITS.put(cooldownKey, String(now), { expirationTtl: 60 });
      await env.RATE_LIMITS.delete(pendingKey);

      ctx.waitUntil(publishFive(interaction.application_id, interaction.token, pending.content));
      return json({ type: 6 });
    }
    return json(ephemeral("不支援的互動類型。"));
  },
};
