# Discord User-Installed Announcement App

A Cloudflare Worker that receives Discord HTTP interactions. It supports **User Install**, so each user can authorize the app without adding a bot account to a server.

## Features

- `/custom spam` opens a modal for a custom announcement (up to 500 characters).
- Requires explicit confirmation before publishing.
- Publishes at most **5 copies** of the confirmed message in the current channel.
- Spaces messages **3 seconds apart**.
- Per-user cooldown: **30 seconds** between publishing runs.
- Disables @everyone, @here, role and user mention parsing.
- Uses Discord HTTP interactions; no persistent Gateway bot is required.

Use this only for authorized announcements in channels where posting is permitted. Do not use it to harass users or disrupt a server. User-installed apps still respect the invoking user's permissions.

## Discord setup

1. Open the application in the Discord Developer Portal.
2. Under **Installation**, enable **User Install**. Enable the contexts you intend to support.
3. Configure the Interactions Endpoint URL to your deployed Worker URL.
4. Register the global `custom` command with a `spam` subcommand. Use `integration_types: [1]` and `contexts: [0, 1, 2]` (only include contexts supported by your application).

Each person must authorize/install the User App before using it. The app cannot post to a channel the user cannot access or send messages in.

## Cloudflare setup

Create a Worker named `discord-spam-bot`. Create a Workers KV namespace and bind it as `RATE_LIMITS`.

Add this Worker secret:

- `DISCORD_PUBLIC_KEY`: the application's public key.

Never commit secrets or share them in chat. This HTTP-interaction version does not need a bot token to receive or answer interactions.

## Deploy

Deploy `worker.js` as a module Worker, bind the KV namespace as `RATE_LIMITS`, and set `DISCORD_PUBLIC_KEY` as a secret. Then register the global slash command from the Developer Portal.
