# Quits

Split the bill at the table. One person pays; everyone else taps what they had and pays them back from their own wallet, on Stellar.

**Live:** https://quits.aircade.xyz (Stellar testnet until the mainnet launch on 24 Oct 2026)

## The problem

At a group dinner one person pays, and then the hard part starts: working out who had what, collecting wallet addresses, chasing people for days. Crypto makes paying easy, but not splitting.

## How Quits works

1. The host opens a table and snaps the place. The photo becomes the cover of the night.
2. Friends scan the QR on the table. It opens in the browser: no app, and no account needed.
3. The host snaps the receipt. Claude reads every line.
4. Everyone taps what they had on a shared, live receipt. Shared plates split themselves, nobody pays for what nobody claimed until the end (then it's split by all), and the tip goes on top.
5. Each guest pays the host back in USDC from their own Stellar wallet, or marks cash for the host to confirm.
6. Quits. The night stays with photos, who was there and what each paid. Signing in with Google keeps it in your profile on any phone.

## How it uses Stellar

- **Money moves wallet to wallet.** Guests pay the host directly in USDC (Circle) on Stellar. Quits never holds funds; it only reads the ledger.
  - USDC issuer, mainnet: `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`
  - USDC issuer, testnet: `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`
- **Every share has a memo**, `QUITS <TABLE> <SEAT>`. Quits confirms a payment either from the transaction hash the wallet returns, or by watching the host's payments on Horizon for that memo (for payments sent by hand from any wallet or exchange).
- **Before a table opens**, Quits checks on Horizon that the host's account exists and can receive USDC (has the trustline), so money can't bounce.
- **Euro bills** are converted at the mid price of the EURC/USDC order book on Stellar mainnet.
- **Wallets**:
  - desktop: [Stellar Wallets Kit](https://github.com/Creit-Tech/Stellar-Wallets-Kit) (Freighter, xBull, LOBSTR, Albedo, Rabet, Hana);
  - phone: WalletConnect (Reown) for Freighter, LOBSTR and Scopuly;
  - anything else (Decaf, an exchange…): send it yourself with address, amount and memo, with a SEP-7 QR on desktop.
- **Planned at HackMeridian:** pay-ins from Base and Solana through Circle CCTP, landing as USDC in the host's Stellar account.

## Architecture

```
browser (vanilla JS + GSAP, esbuild)          Cloudflare Worker
  src/web/main.js   ──── HTTPS / WebSocket ──▶  src/worker/index.js   API + static app
  src/web/wallet.js (loaded only to pay)         ├─ TableDO   one Durable Object per table: live state,
                                                 │            seats, photos (SQLite), payment watcher
  src/shared/logic.js  ◀── same split logic ──▶  ├─ UserDO    one per Google account: profile, nights
                                                 ├─ LimiterDO daily caps (AI calls, sign-ins, tries)
                                                 ├─ ai.js     Claude Haiku reads receipts and venue signs
                                                 └─ stellar.js Horizon: verify payments, trustlines, rates
```

- Live tables: WebSockets with Durable Object hibernation. What one person taps, everyone sees at once.
- Receipt reading: Anthropic Messages API with a forced tool call for structured output. About $0.0007 per receipt.
- Accounts: Sign in with Google (ID tokens checked against Google's keys in the Worker) and HMAC-signed sessions. Optional for guests.
- Opening a table can require an invite code (`INVITE_CODES`); joining never does.

## Run it locally

Requires Node 20+.

```
npm install
cp .dev.vars.example .dev.vars   # fill in the values
npm run dev                      # builds the app and serves it on http://localhost:8787
```

| Variable | Where | What |
|---|---|---|
| `ANTHROPIC_API_KEY` | secret | Reads receipts and venue photos (`AI_MOCK=1` uses a sample receipt instead) |
| `SESSION_SECRET` | secret | Signs sign-in sessions |
| `INVITE_CODES` | secret, optional | Comma-separated codes needed to open a table |
| `AUTH_TEST` | `.dev.vars` only | `1` shows a test sign-in button instead of Google. Never in production |
| `NETWORK` | `wrangler.jsonc` | `testnet` or `public` |
| `GOOGLE_CLIENT_ID` | `wrangler.jsonc` | Google sign-in (public). Without it the app runs without accounts |
| `WC_PROJECT_ID` | `wrangler.jsonc` | Reown / WalletConnect project (public) |
| `CLAUDE_MODEL`, `AI_DAILY_MAX` | `wrangler.jsonc` | Model and daily cap on AI calls |

## Deploy

```
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put SESSION_SECRET
npx wrangler secret put INVITE_CODES
npm run deploy
```

## Demo

1. Open https://quits.aircade.xyz on your phone and continue with Google. Opening a table needs an invite code; judges get one from the team.
2. Snap the place, then the receipt.
3. Scan the table's QR with a second phone and join (with Google or without an account).
4. Tap what you had, then pay from a Stellar wallet, or send it by hand with the memo, or mark cash.

## Tests

They use Playwright (`npm i -D playwright && npx playwright install chromium`) and testnet accounts made by `test/accounts.mjs`.

- `test/ui-flow.mjs`: the whole night in real browsers. Three phones, invite code, receipt read by the real model, cash confirmed by the host, a real testnet USDC payment detected by memo, the shared night, and a fourth "new phone" where a guest signs in and finds her night.
- `test/api-flow.mjs`: the same through the API, with both payment paths.
- `test/auth-unit.mjs`: Google token checks (valid, wrong audience, expired, forged) and sessions.
- `test/wc-smoke.mjs`: the phone wallet picker (WalletConnect) opens with Stellar wallets only.

## On-chain proof

A payment made through Quits on testnet: [`6e9be7ac…09cc0`](https://stellar.expert/explorer/testnet/tx/6e9be7ac56fd4bbff9bbe362b54acb701c8edf3cc1505cfd8df225f4a6409cc0) (70.02 USDC, memo `QUITS CANTFYY P2`).

## Built with AI

Quits is built by a solo founder, Carlos de la Figuera. The code is written by Claude (Anthropic), as declared in the HackMeridian submission.

## Prior work

Everything here before the `pre-hackmeridian` tag was built before HackMeridian 2026. Work done during the event (CCTP pay-ins) comes after that tag.
