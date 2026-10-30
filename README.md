# Discord User-Installed Announcement App

A Cloudflare Worker that receives Discord HTTP interactions. The app is designed for **user installation**, so users do not need to add a bot account to a server.

## Features

- `/custom spam` opens a modal for a short announcement and a count (1–5).
- Requires an explicit confirmation before posting.
- Per-user cooldown: 10 seconds.
- Disables everyone/here and role/user mention parsing.
- Uses Discord interaction responses; it does not run a Gateway bot.

## Important Discord limitation

User-installed apps can be used in supported contexts, but they act only within the permissions and capabilities Discord grants to the authorizing user. This app cannot post to channels the user cannot access.

## Cloudflare setup

Create a Worker named `discord-spam-bot` and add these secrets:

- `DISCORD_PUBLIC_KEY`: the application's public key.
- `DISCORD_BOT_TOKEN`: a bot token used only for registering commands / optional API operations. Never commit it or share it in chat.

Set the Worker URL as the Discord Interactions Endpoint URL. Register the global command with `integration_types: [1]` and `contexts: [0, 1, 2]` after enabling User Install in the Discord Developer Portal.

## Deploy

Use the Cloudflare Worker script in `worker.js`. Configure the secrets in Cloudflare, not in source control.
