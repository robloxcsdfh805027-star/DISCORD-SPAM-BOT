const applicationId = process.env.DISCORD_APPLICATION_ID;
const guildId = process.env.DISCORD_GUILD_ID;
const botToken = process.env.DISCORD_BOT_TOKEN;

if (!applicationId || !guildId || !botToken) {
  throw new Error("Set DISCORD_APPLICATION_ID, DISCORD_GUILD_ID, and DISCORD_BOT_TOKEN.");
}

const command = {
  name: "custom",
  description: "伺服器訊息發布工具",
  options: [
    {
      type: 1,
      name: "spam",
      description: "選擇發布 1 到 5 則訊息",
      options: [
        {
          type: 4,
          name: "count",
          description: "要發布的訊息數量（1 到 5）",
          required: true,
          min_value: 1,
          max_value: 5
        },
        ...[1, 2, 3, 4, 5].map((number) => ({
          type: 3,
          name: `message${number}`,
          description: `第 ${number} 則訊息內容`,
          required: false,
          max_length: 1800
        }))
      ]
    }
  ]
};

const response = await fetch(
  `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`,
  {
    method: "PUT",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify([command])
  }
);

if (!response.ok) {
  throw new Error(`Discord command registration failed: ${response.status} ${await response.text()}`);
}
console.log("Registered /custom spam.");
