# Turtle Yard relay

A tiny Cloudflare Worker that passes messages between two games so friends can visit each other's yards and give turtles as gifts. It saves nothing: no accounts, no yards, no names. Every game connects with a random device id, and that's all the server knows.

- **Visit codes:** the host gets a 6-digit code that works for 10 minutes and lets one visitor in. The host still has to tap **Let them in**.
- **Friends:** after one visit both games remember each other on the device. Mutual friends can see each other online and knock without a code. The host still says yes every time.
- **Safety:** no chat. Knocking is rate limited (per connection and per IP) so codes can't be guessed. Only the game's own pages can connect (`ALLOWED_ORIGINS` in `wrangler.toml`).

## Run it locally

```sh
cd server
npm install
npm run dev                 # relay on ws://127.0.0.1:8787
node test/relay.test.mjs    # protocol checks against the running relay
```

Then, from the project root, run `npm run dev` and open two players. They need different origins, so each gets its own save:

- http://localhost:5200/?relay=ws://127.0.0.1:8787
- http://127.0.0.1:5200/?relay=ws://127.0.0.1:8787

The `?relay=` override only works on localhost, so a link can't point the real site at another server.

## Deploy

1. Make a free Cloudflare account at https://dash.cloudflare.com/sign-up.
2. Sign in from this folder with `npx wrangler login`, then run `npm run deploy`.
3. Wrangler prints the address, e.g. `https://turtle-yard-relay.<your-subdomain>.workers.dev`.
4. In `js/game.js`, set `RELAY_DEFAULT` to the same address with `wss://` in front:
   `const RELAY_DEFAULT = 'wss://turtle-yard-relay.<your-subdomain>.workers.dev';`
   Until this is set, the 👫 button stays hidden and the game never goes online.
5. Push to `main` (GitHub Pages updates), then rebuild the Android app (`npm run build`, `npx cap sync android`).
6. Update the Play Console answers as described in `store/LISTING.md` (content rating and Data safety).

The free Workers plan should cover a hobby game. One Durable Object holds every connection, and it hibernates while nobody is sending anything. Live visits send about 4 small messages a second.

If you move the website to another domain, add it to `ALLOWED_ORIGINS` and deploy again.
