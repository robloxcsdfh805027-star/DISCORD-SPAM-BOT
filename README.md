# Discord User-Installed Announcement App

A Cloudflare Worker that receives Discord HTTP interactions. It is designed for **user installation**, so you do not need to add a bot account to a server.

## Features

- `/custom spam` opens a modal for one announcement (up to 500 characters).
- Requires explicit confirmation before posting.
- One public announcement per confirmation; no repeated-message loop.
- Per-user cooldown: 10 seconds.
- Disables @everyone, @here, role and user mention parsing.
- Uses Discord HTTP interactions; no persistent Gateway bot is required.

## Discord setup

1. Open the application in the Discord Developer Portal.
2. Under **Installation**, enable **User Install**. Enable the contexts you intend to support.
3. Configure the Interactions Endpoint URL to your deployed Worker URL.
4. Register the global `custom` command with a `spam` subcommand. Use `integration_types: [1]` and `contexts: [0, 1, 2]` (only include contexts supported by your application).

User-installed apps still respect the invoking user's permissions. The app cannot post to a channel the user cannot access or send messages in.

## Cloudflare setup

Create a Worker named `discord-spam-bot`. Create a Workers KV namespace and bind it as `RATE_LIMITS`.

Add this Worker secret:

- `DISCORD_PUBLIC_KEY`: the application's public key.

Never commit secrets or share them in chat. This HTTP-interaction version does not need a bot token to receive or answer interactions.

## Deploy

Deploy `worker.js` as a module Worker, bind the KV namespace as `RATE_LIMITS`, and set `DISCORD_PUBLIC_KEY` as a secret. Then register the global slash command from the Developer Portal's application command API using an appropriately authorized application credential.
