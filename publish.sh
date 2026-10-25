#!/bin/sh
# Publishes Quits to quits.aircade.xyz with the round turned on.
# Needs .env (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID) next to it, and the relay account's key in
# contracts/.keys/<network>.json, where <network> is GAME_NETWORK in wrangler.jsonc (public = mainnet).
set -e
cd "$(dirname "$0")"
NET=$(grep -o '"GAME_NETWORK": *"[a-z]*"' wrangler.jsonc | sed 's/.*"\([a-z]*\)"$/\1/')
KEYS="contracts/.keys/${NET:-testnet}.json"
test -f .env || { echo "Missing .env with CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID"; exit 1; }
test -f "$KEYS" || { echo "Missing $KEYS (the account that relays the round on $NET)"; exit 1; }
set -a; . ./.env; set +a
test -d node_modules || npm install --no-audit --no-fund
node -e "console.log(require('./$KEYS').secret)" | npx wrangler secret put GAME_SECRET
npm run deploy
