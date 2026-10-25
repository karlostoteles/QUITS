#!/bin/sh
# Publishes Quits to quits.aircade.xyz with the round turned on.
# Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID (in .env next to it, or exported) and the relay account's key in
# contracts/.keys/<network>.json, where <network> is GAME_NETWORK in wrangler.jsonc (public = mainnet).
set -e
cd "$(dirname "$0")"
NET=$(grep -o '"GAME_NETWORK": *"[a-z]*"' wrangler.jsonc | sed 's/.*"\([a-z]*\)"$/\1/')
KEYS="contracts/.keys/${NET:-testnet}.json"
test -f "$KEYS" || { echo "Missing $KEYS (the account that relays the round on $NET)"; exit 1; }
if test -f .env; then set -a; . ./.env; set +a; fi
test -n "$CLOUDFLARE_API_TOKEN" || { echo "Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID (in .env, or exported)"; exit 1; }
test -d node_modules || npm install --no-audit --no-fund
node -e "console.log(require('./$KEYS').secret)" | npx wrangler secret put GAME_SECRET
npm run deploy
