const applicationId = process.env.DISCORD_APPLICATION_ID;
const guildId = process.env.DISCORD_GUILD_ID;
const botToken = process.env.DISCORD_BOT_TOKEN;

if (!applicationId || !guildId || !botToken) {
  throw new Error("Set DISCORD_APPLICATION_ID, DISCORD_GUILD_ID, and DISCORD_BOT_TOKEN.");
}

const command = {
  name: "custom",
  description: "管理員公告工具",
  default_member_permissions: "32",
  options: [
    {
      type: 1,
      name: "spam",
      description: "依序發布五則公告訊息",
      options: [1, 2, 3, 4, 5].map((number) => ({
        type: 3,
        name: `message${number}`,
        description: `第 ${number} 則公告內容`,
        required: true,
        max_length: 1800
      }))
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
