const API = "https://discord.com/api/v10";
const MAX_COUNT = 5;
const COOLDOWN_SECONDS = 10;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function verify(req, body, publicKey) {
  const signature = req.headers.get("X-Signature-Ed25519");
  const timestamp = req.headers.get("X-Signature-Timestamp");
  if (!signature || !timestamp) return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw", hexToBytes(publicKey), { name: "Ed25519" }, false, ["verify"]
    );
    return await crypto.subtle.verify(
      "Ed25519", key, hexToBytes(signature),
      new TextEncoder().encode(timestamp + body)
    );
  } catch {
    return false;
  }
}

function message(content, components = []) {
  return {
    type: 4,
    data: {
      content,
      flags: 64,
      components,
      allowed_mentions: { parse: [] },
    },
  };
}

function confirmRow() {
  return [{
    type: 1,
    components: [
      { type: 2, style: 3, label: "確認發布", custom_id: "publish_confirm" },
      { type: 2, style: 2, label: "取消", custom_id: "publish_cancel" },
    ],
  }];
}

export default {
  async fetch(req, env) {
    if (req.method !== "POST") return new Response("Discord interactions endpoint", { status: 200 });
    const body = await req.text();
    if (!(await verify(req, body, env.DISCORD_PUBLIC_KEY))) return new Response("Invalid signature", { status: 401 });

    const interaction = JSON.parse(body);
    if (interaction.type === 1) return json({ type: 1 });

    const user = interaction.member?.user || interaction.user;
    if (!user?.id) return json(message("無法辨識使用者。"));

    if (interaction.type === 2) {
      const cmd = interaction.data;
      if (cmd.name !== "custom" || cmd.options?.[0]?.name !== "spam") {
        return json(message("不支援的指令。"));
      }
      return json({
        type: 9,
        data: {
          custom_id: "announcement_modal",
          title: "建立頻道公告",
          components: [
            { type: 1, components: [{ type: 4, custom_id: "announcement_text", label: "公告內容", style: 2, min_length: 1, max_length: 500, required: true, placeholder: "輸入要發布的公告" }] },
            { type: 1, components: [{ type: 4, custom_id: "announcement_count", label: "發布次數（1–5）", style: 1, min_length: 1, max_length: 1, required: true, value: "1", placeholder: "1 到 5" }] },
          ],
        },
      });
    }

    if (interaction.type === 5 && interaction.data.custom_id === "announcement_modal") {
      const fields = interaction.data.components.flatMap(row => row.components || []);
      const content = fields.find(x => x.custom_id === "announcement_text")?.value?.trim();
      const count = Number(fields.find(x => x.custom_id === "announcement_count")?.value);
      if (!content || !Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
        return json(message("內容或次數不正確；次數必須是 1 到 5。"));
      }
      const state = btoa(unescape(encodeURIComponent(JSON.stringify({ content, count, userId: user.id })))).replace(/=/g, "");
      return json({
        type: 4,
        data: {
          content: `請確認公告內容（將發布 ${count} 則）：\n> ${content}\n\n確認後會公開發布到目前頻道。`,
          flags: 64,
          components: confirmRow().map(row => ({
            ...row,
            components: row.components.map(button => ({ ...button, custom_id: button.custom_id + ":" + state })),
          })),
          allowed_mentions: { parse: [] },
        },
      });
    }

    if (interaction.type === 3) {
      const [action, state] = (interaction.data.custom_id || "").split(":");
      if (action === "publish_cancel") return json(message("已取消發布。"));
      if (action !== "publish_confirm" || !state) return json(message("確認資訊無效，請重新輸入。"));
      let payload;
      try { payload = JSON.parse(decodeURIComponent(escape(atob(state)))); } catch { return json(message("確認資訊已失效，請重新輸入。")); }
      if (payload.userId !== user.id) return json(message("只有建立公告的人可以確認發布。"));
      const key = "cooldown:" + user.id;
      const previous = await env.RATE_LIMITS.get(key);
      if (previous) return json(message("你操作得太頻繁，請稍後再試（每人冷卻 10 秒）。"));
      await env.RATE_LIMITS.put(key, "1", { expirationTtl: COOLDOWN_SECONDS });

      const token = interaction.token;
      const appId = interaction.application_id;
      const endpoint = `${API}/webhooks/${appId}/${token}`;
      const first = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content: payload.content,
          allowed_mentions: { parse: [] },
        }),
      });
      if (!first.ok) return json(message("發布失敗，請稍後再試。"));
      for (let i = 1; i < payload.count; i++) {
        await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            content: payload.content,
            allowed_mentions: { parse: [] },
          }),
        });
      }
      return json(message(`已發布 ${payload.count} 則公告。`));
    }

    return json(message("不支援的互動類型。"));
  },
};