# Discord Custom Announcements

Cloudflare Worker for a Discord slash command: `/custom spam`.

It posts 1–5 messages, in order, to the channel where the command was used. Any member of the server can run it. Messages are posted by the bot account; Discord members see the bot as the sender.

## Safety and limits

- Any member of the server can run it.
- Choose 1–5 messages per invocation; each message is limited to 1,800 characters.
- A 60-second per-user cooldown is applied using the Worker cache; cache-based limits are best-effort and may vary across Cloudflare locations.
- Two seconds between messages.
- Automatic @everyone, role, and user mentions are disabled.
- Use this only for authorized server announcements. Do not use it to flood channels or contact people without consent.

## 1. Create a Discord application

1. Create an application in the Discord Developer Portal.
2. Add a bot and invite it to your server with permission to view the target channel and send messages.
3. Enable the `applications.commands` scope when inviting the app.
4. Copy the Application ID, bot token, public key, and the target server (guild) ID.

## 2. Configure Cloudflare

Install dependencies and authenticate Wrangler:

```sh
npm install
npx wrangler login
```

Set secrets (do not commit these values):

```sh
npx wrangler secret put DISCORD_BOT_TOKEN
npx wrangler secret put DISCORD_PUBLIC_KEY
```

Deploy:

```sh
npm run deploy
```

Copy the deployed Worker URL and set it as the **Interactions Endpoint URL** in the Discord Developer Portal.

## 3. Register the slash command

Set these environment variables locally (do not commit a .env file):

- `DISCORD_APPLICATION_ID`
- `DISCORD_GUILD_ID`
- `DISCORD_BOT_TOKEN`

Then run:

```sh
node scripts/register-command.mjs
```

The command appears as `/custom spam` in that server.

## 4. Use it

Run `/custom spam`, choose `count` from 1 to 5, then fill in the matching message fields starting with `message1`. The bot posts those messages in the current channel.

## Project layout

- `src/worker.js` — verifies Discord interaction signatures, applies basic limits, and sends messages.
- `scripts/register-command.mjs` — registers the guild slash command.
- `wrangler.jsonc` — Cloudflare Worker configuration.
