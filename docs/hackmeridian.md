# HackMeridian 2026: submission notes for Quits

Genesis path · tracks: Stellar Unlocked (a game with real stakes judged by a Soroban contract, on the protocol's own hashing and signature host functions) and Stellar Composed (Stellar Wallets Kit + WalletConnect + USDC by Circle + Claude for the receipt). Team: Carlos de la Figuera (solo; the code is written by Claude, declared).

## Answers for the portal

**One line.** Quits splits the bill at the table and, if the table dares, plays for it: a round of hidden coins sealed and judged by a Soroban contract decides who pays for everyone.

**The problem.** At a group dinner one person pays, and then the hard part starts: working out who had what, collecting wallet addresses, chasing people for days. Crypto makes paying easy, but not splitting. And the oldest way to settle a bill between friends, playing for it, has no honest version on a phone: whoever goes last always knows too much.

**What Quits does.** The host opens a table and snaps the receipt; Claude reads it. Friends scan the QR, tap what they had on a live shared receipt and pay the host back in USDC from their own Stellar wallet (one tap from Freighter or LOBSTR, or by hand with a memo from Decaf or an exchange). Quits never holds money: it only reads the ledger. The night stays, with photos and who was there.

**What was built at HackMeridian: Who pays?** Before paying back, the host can propose a round. Everyone who is in hides 0–3 coins and calls the total. Each move is sealed (a hash signed with a key that only that phone has) on the `whopays` contract, and opened once every seal is on chain. The contract names who pays: furthest from the real total, ties drawn from the salts, silence loses. The loser's part becomes everyone's; the others are off the hook. Playing is optional, nothing is wagered, the contract holds no funds.

**Why Stellar, and what we unlock.** The round lives on three things the protocol already has: `sha256` and `ed25519_verify` as host functions, cheap transactions (a three-player round is five transactions and about 0.1 XLM), and temporary storage, which lets a round cost rent for an hour instead of a month. Players never need a Stellar account: moves are signed in the browser and relayed by one funded account, so a game with real stakes runs for people who arrived with nothing but a phone. Payments stay wallet to wallet in USDC, with the memo as the receipt.

**Track alignment.**
- *Stellar Unlocked* (“protocol-powered games: real onchain stakes and outcomes on core protocol features”): the round is exactly that. Its stakes are a real bill; its outcome is decided by a contract on the protocol’s own primitives, `ed25519_verify` and `sha256`, with temporary storage and events doing what they were built for. Nothing in it needs a wallet, an account or a token: the protocol itself is the referee.
- *Stellar Composed* (“combine two or more ecosystem tools into something new, on infrastructure that keeps running after demo day”): Quits composes Stellar Wallets Kit and WalletConnect (Reown) for one-tap payments, USDC by Circle as the money, Horizon for confirmation, Claude for the receipt, and now its own contract for the round. It is live on mainnet, used at real dinners, and stays up after Monday.

**Technical execution.** Rust contract (soroban-sdk 29, 16 KB), 10 tests, deployed on testnet; a relay Durable Object that batches seals and openings into single transactions; the browser signs with `@noble/ed25519`; the Worker re-checks every signature and hash before relaying, and the contract checks them again. Two end-to-end tests: the round through the API (forged seals and wrong openings refused) and the round in three real browsers (Playwright), from the proposal to the loser paying.

**Users and value.** Groups that already pay each other in crypto: hackathon tables, side events, crypto meetups, the dinner after the conference. The round turns the awkward moment of a bill into the best moment of the night, and it is the first thing people ask to show their friends.

**Business model / sustainability.** Quits is a product of a small AI-native agency: it is sold as a service to event hosts and communities (a table and its rounds for a meetup, a side event, a conference dinner), with the app itself free for a table of friends. Running costs are tiny: $0.0007 per receipt read, Cloudflare's free tier, cents of XLM per round.

**Next steps.** Pay-ins from Base and Solana through Circle CCTP; the round on mainnet (one relay account funded with a few XLM); shorter reveal windows as Stellar's ledgers get faster; a verifier of the verdict in the night page so anyone can re-check a round from its transactions.

**Prior work (declared).** Everything up to the `pre-hackmeridian` branch (last commit `5efdcad`, 21 Oct) was built before the event: the bill-splitting app on mainnet. Everything after it on `main` was built on 25–26 October.

## Video script (about 2 minutes)

Two phones side by side, the table on the left (Carlos), a guest on the right (Ana). Captions in English.

| Time | On screen | Caption |
|---|---|---|
| 0:00 | Carlos opens a table, snaps the receipt; lines appear | **Quits splits the bill at the table.** Claude reads the receipt. |
| 0:15 | Ana scans the QR, taps her things; Carlos's view updates live | Everyone taps what they had. Live, in the browser, no app. |
| 0:30 | Carlos taps *Who pays? Play a round*; Ana's phone shows the invite; both tap *I'm in* | **Or play for it.** Hidden coins: everyone in, moves sealed on Stellar. |
| 0:45 | Ana picks 2 coins, calls 5, taps *Seal my move*; "Sealed", waiting for Carlos | Each move is a signed hash on a Soroban contract. Nobody sees it until everyone has sealed. |
| 1:00 | Both phones: *Opening*; coins and calls appear one by one | The phones open their moves; the contract checks them against the seals. |
| 1:15 | *Ana pays*: "6 coins on the table. Ana said 3, furthest off." Link to the transaction | **The contract decides.** Furthest from the total pays for everyone. Silence loses. |
| 1:30 | Carlos closes the receipt; Ana's pay screen shows "The round: Carlos and Tom"; Tom's phone shows "Ana pays for you" | The loser pays the host in USDC, wallet to wallet. The others are off the hook. |
| 1:45 | The night page: photos, who had what, "The round" with the moves and the transaction | The night stays, round included. **Quits.** |

## Deck (8 slides)

1. **Quits.** Split the bill at the table. Or play for it. (phone screenshot of the result sheet)
2. **The problem.** One person pays; days of chasing. Crypto solved paying, not splitting. And playing for the bill has no honest version on a phone.
3. **Quits today.** Snap the receipt (AI reads it), friends tap what they had, pay back in USDC wallet to wallet. Live on mainnet. (the 12-screen strip)
4. **Who pays?** Hidden coins, one simultaneous round: seal → open → verdict. Loser pays for everyone who played. (the 4 round screens)
5. **Why a contract.** Sealed moves: no waiting, no changing, no backing out (silence loses). Verdict with a transaction anyone can check. Holds no money. Players need no wallet to play.
6. **On Stellar.** `whopays` on testnet: ed25519_verify + sha256 host functions, batched seals and openings, temporary storage, ~0.1 XLM per round. Payments: USDC, memo as receipt, Horizon. (cost table)
7. **Built at HackMeridian.** Contract + 10 tests + testnet; relay; round in the table; screens; two end-to-end tests. Before: the app. (commit timeline)
8. **Next, and who it's for.** CCTP pay-ins from Base/Solana; mainnet round; hosts and communities as the customers of a small AI-native agency. Carlos de la Figuera · built with Claude.
