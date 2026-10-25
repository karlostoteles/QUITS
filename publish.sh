#!/bin/sh
# Publishes Quits to quits.aircade.xyz with the round turned on.
# Needs .env (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID) and contracts/.keys/testnet.json (the relay account) next to it.
set -e
cd "$(dirname "$0")"
test -f .env || { echo "Missing .env with CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID"; exit 1; }
test -f contracts/.keys/testnet.json || { echo "Missing contracts/.keys/testnet.json (the account that relays the round)"; exit 1; }
set -a; . ./.env; set +a
test -d node_modules || npm install --no-audit --no-fund
node -e "console.log(require('./contracts/.keys/testnet.json').secret)" | npx wrangler secret put GAME_SECRET
npm run deploy
