const API = "https://discord.com/api/v10";
const COOLDOWN_MS = 10_000;

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
    { type: 2, style: 3, label: "確認發布", custom_id: "publish_confirm:" + id },
    { type: 2, style: 2, label: "取消", custom_id: "publish_cancel:" + id },
  ],
}];

export default {
  async fetch(req, env) {
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
              placeholder: "輸入要發布的一則公告",
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
          content: "請確認要在目前頻道發布這一則公告：\n> " + content + "\n\n確認後會公開發布；每位使用者每 10 秒可發布一次。",
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
      if (!raw) return json(ephemeral("確認資訊已過期，請重新輸入。"));
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
      if (now - last < COOLDOWN_MS) return json(ephemeral("你操作得太頻繁，請等待 10 秒後再試。"));
      await env.RATE_LIMITS.put(cooldownKey, String(now), { expirationTtl: 60 });
      await env.RATE_LIMITS.delete(pendingKey);

      const endpoint = API + "/webhooks/" + interaction.application_id + "/" + interaction.token;
      const sent = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: pending.content, allowed_mentions: { parse: [] } }),
      });
      if (!sent.ok) return json(ephemeral("發布失敗；請確認你在目前頻道有發言權限。"));
      return json(ephemeral("公告已成功發布一次。"));
    }
    return json(ephemeral("不支援的互動類型。"));
  },
};
