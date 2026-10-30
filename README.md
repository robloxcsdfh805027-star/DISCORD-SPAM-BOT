# Discord Custom Announcements

Cloudflare Worker for a Discord slash command: `/custom spam`.

It posts exactly five administrator-supplied messages, in order, to the channel where the command was used. Messages are posted by the bot account; Discord members see the bot as the sender. The command user is not added to the message text.

## Safety and limits

- Only members with **Manage Server** or **Administrator** permission can run it.
- Exactly five messages per invocation; each message is limited to 1,800 characters.
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

Run `/custom spam` and fill in `message1` through `message5`. The bot posts each message in the current channel.

## Project layout

- `src/worker.js` — verifies Discord interaction signatures, checks permissions, and sends messages.
- `scripts/register-command.mjs` — registers the guild slash command.
- `wrangler.jsonc` — Cloudflare Worker configuration.
