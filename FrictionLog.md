# Friction log: Quits at HackMeridian 2026

Written on 5 November 2026 for the Stellar developer survey. Project: this repo, live at https://quits.aircade.xyz on Stellar mainnet. Event: HackMeridian 2026, ONE16 Lisbon, 25–26 October, Genesis path (Stellar Unlocked + Stellar Composed).

**Who "we" are.** Carlos de la Figuera, a non-technical solo founder, and Claude (Anthropic), which wrote all the code. Carlos decided what to build, funded the accounts, tested on real phones with friends at the venue and reported what broke. This matters for reading the log: part of the friction below is what an AI coding agent runs into on Stellar (docs it trusts that are stale, build steps that only work through one tool), and the time figures are rough: hours of agent work plus human testing time, reconstructed from the commit log and our chat history, not from a stopwatch.

## 1. What we built

Quits splits the bill at the table. One person pays; the host snaps the receipt, Claude reads the lines, friends scan a QR, tap what they had on a live shared receipt and pay the host back in USDC from their own Stellar wallet. Quits never holds funds: it only reads the ledger. The night stays with photos and who paid what.

- **Before the event (9–21 October, branch `pre-hackmeridian`):** the whole app, on mainnet by 20 October. Cloudflare Worker + Durable Objects, Stellar Wallets Kit and WalletConnect for one-tap payments, a manual "send it yourself with a memo" path, Google sign-in, Playwright tests.
- **At the event (25–26 October):** *Who pays?*, a round of hidden coins (the Spanish bar game *los chinos*) that decides who pays for everyone. Moves are sealed (hashed, signed with a browser-side Ed25519 key) and opened on a Soroban contract, `contracts/whopays`, which names the loser: furthest from the real total, ties drawn from the salts, silence loses. Players need no account or wallet; one funded account relays everything. Contract with 10 tests, deployed on testnet and mainnet the same afternoon; first round from two phones on the live app at 02:46 on 26 October. Five transactions and 0.007 XLM per three-player round on mainnet.

In parallel, outside the submission, we built a verifier for StarkWare's Stwo (Circle STARK) proofs that runs inside a Soroban contract on testnet, plus a hash-only account-recovery prototype. That project is where most of the Soroban-specific friction came from, so its points are included in section 3.10.

## 2. Stellar tools we used

| Tool | How we used it |
|---|---|
| **Soroban smart contracts** (Rust, `soroban-sdk` 29.0.1) | `whopays`: the referee of the round. `ed25519_verify` and `sha256` host functions check every seal and opening; rounds live an hour in temporary storage; events are the record. 10 tests with `testutils` and `ed25519-dalek`. 16 KB of Wasm. |
| **Stellar CLI** (`stellar-cli` 25) | `stellar contract build` / `optimize` / `upload` / `deploy --alias` with a named identity on testnet; a fee-bumped upload when testnet rent surged. Mainnet upload and create went through our own script instead (`contracts/scripts/whopays.mjs`). |
| **Stellar JS SDK** (`@stellar/stellar-sdk` 17.2) | In the Worker and in scripts: `rpc.Server` simulate → assemble → send → poll `getTransaction` for every contract call (`src/worker/chain.js`); `Keypair`, `TransactionBuilder`, `nativeToScVal`/`scValToNative`. In the browser: building the USDC payment that the wallet signs. |
| **Soroban RPC** | `soroban-testnet.stellar.org` and `mainnet.sorobanrpc.com`. Simulation also doubles as our read path for contract state. |
| **Horizon** (plain `fetch`, no SDK) | Confirming payments (`/transactions/{hash}/payments`), finding hand-sent payments by memo (`/accounts/{id}/payments?join=transactions`), trustline checks before a table opens (`/accounts/{id}`), EUR→USD at the EURC/USDC order-book mid price (`/order_book`), issuer sanity checks (`/assets`). |
| **Friendbot** and the **testnet DEX** | Funding test accounts; swapping XLM for testnet USDC/EURC with path payments (`test/fund.mjs`). |
| **Stellar Wallets Kit** (`@creit.tech/stellar-wallets-kit` 2.7) | Desktop: Freighter, xBull, LOBSTR, Albedo, Rabet, Hana modules. Phones: its WalletConnect module (Reown AppKit) for Freighter, LOBSTR and Scopuly. |
| **Freighter** | Desktop extension through the kit. Phone pairing over WalletConnect: never confirmed (see 3.1). |
| **LOBSTR** | On phones, through a SEP-7 payment link (see 3.1). Desktop through the kit. |
| **Decaf** (and exchanges) | The founder's own wallet. No dapp connection, so it uses the manual path: address, amount and memo, with a SEP-7 QR on desktop. |
| **SEP-7** (`web+stellar:pay`) | Prefilled payment links and QRs. Ended up being the most reliable way to pay from a phone. |
| **USDC and EURC** (Circle) | USDC is the money on mainnet; EURC/USDC only for the exchange rate. |
| **Circle CCTP** | A pre-event spike on 2 October (Arc testnet → Stellar testnet). Planned for the event, not built there (see 3.8). |
| **stellar.expert** and **Stellar Lab** | Every on-chain proof in the README links to stellar.expert. Lab, in the parallel project, to share a prefilled contract call. |
| **Stellar Raven MCP** (`raven.stellar.org/mcp`) | Connected mid-hackathon on 25 October; before that, docs came from developers.stellar.org, GitHub source and the network itself (RPC, Horizon). See 3.7. |
| Also: `developers.stellar.org`, the `stellar-protocol` repo (CAPs), `soroban-env-host` source for cost parameters. | |

## 3. Friction

Each item: what happened, roughly what it cost, how we got around it. Ordered by what hurt most.

### 3.1 LOBSTR would not pair over WalletConnect from Safari on an iPhone

**What happened.** At the venue, with the first real tables, Carlos tapped "Use my wallet" → LOBSTR on his iPhone. LOBSTR opened on its portfolio screen and never showed the connection request; Quits waited forever on "continue in LOBSTR". The kit's WalletConnect module hands the wallet list to Reown AppKit, whose registry entry for LOBSTR opens `lobstr://wc?uri=…`; on iOS that opens the app without delivering the pairing. We then tried LOBSTR's universal link (`https://lobstr.co/uni/wc?uri=…`, the one it registered), an undocumented `univ2` route the app responds to, the raw `wc:` URI, and variants of each: 8 links on a hidden `/wc-test` page, one by one on a real phone. LOBSTR answered "Invalid transaction signature request" to some and ignored the rest. Scanning the QR from a laptop did connect, so the problem is specifically app-to-app on iOS.

**Cost.** About 4 hours of engineering spread over the night of 25–26 October (reported at 20:31, solved at 03:13, interleaved with other fixes), plus half an hour of Carlos tapping links on his phone, during the only night we had real tables to test with. Nothing in the Stellar docs, the kit's issues or Raven covered it; the answer came from reading AppKit's source and LOBSTR's registry entry, and from trying.

**Workaround.** Stop pairing and pay through a SEP-7 link instead. A second list of 8 `web+stellar:pay` variants on the same test page found one that opens LOBSTR's Send screen with destination, amount and memo filled in; Quits then sees the payment on Horizon by its memo. "LOBSTR on this phone" is now the first option on phones; WalletConnect stays for Freighter and Scopuly. Still open: we never confirmed a phone-to-phone WalletConnect pairing with any Stellar wallet.

### 3.2 Testnet rent surge: a 16 KB upload quoted at ~2,700 testnet XLM, a `create` at ~9,000

**What happened.** The week of the event, testnet's live Soroban state was above its target and rent was in surge pricing. Our first build kept rounds in persistent storage for 30 days: creating a round was quoted at about 9,000 testnet XLM of rent, and uploading 16 KB of Wasm at ~2,700. The CLI just prints the fee; nothing says why it is 100× what you expected.

**Cost.** About 1.5 hours on the afternoon of 25 October: rewriting storage from persistent to temporary, re-running the tests, a second upload (fee-bumped through the CLI) and a second deploy. It also made the testnet cost table misleading (≈0.1 XLM per round on testnet that week against 0.007 XLM on mainnet), which we had to explain in `contracts/README.md`.

**Workaround.** Rounds live in temporary storage with the shortest TTL the network allows (720 ledgers, about an hour); the transactions and events are the record. We moved to mainnet the same afternoon, where the upload and create cost 18.4 XLM once. A good outcome in the end, but found by accident.

### 3.3 The phone wallet picker listed MetaMask and friends; the Stellar wallet IDs are not written down anywhere

**What happened.** The kit's WalletConnect module opens Reown's AppKit modal, which by default lists hundreds of EVM wallets. To show only wallets that speak Stellar we needed their WalletConnect registry IDs (Freighter, LOBSTR, Scopuly), which are not in the Stellar docs or the kit's README; we queried `explorer-api.walletconnect.com` to find them.

**Cost.** About an hour before the event. The same registry data is where the LOBSTR `lobstr://` problem of 3.1 comes from.

**Workaround.** `appKitOptions.includeWalletIds` / `featuredWalletIds` with the three IDs, and a smoke test (`test/wc-smoke.mjs`) that the sheet lists Stellar wallets only.

### 3.4 The wallet our founder already had cannot connect to a dapp

**What happened.** Carlos's Stellar wallet was Decaf, which (like exchanges) has no WalletConnect or extension path. Half of the people at a crypto dinner are in the same situation, so a payments app cannot assume a dapp-capable wallet.

**Cost.** 2–3 hours before the event to build a second payment path: address, amount and memo to copy, a SEP-7 QR on desktop, and Horizon polling for a payment carrying that memo. Then another hour of tuning once real people typed memos: casing and spacing vary ("quits cant7da p2"), so we compare letters and digits only, and wallets round amounts, so we allow a cent.

**Workaround.** The manual path became the universal fallback and the base of the LOBSTR fix. Not wasted work, but it is work every Stellar consumer app has to redo.

### 3.5 Getting testnet USDC and EURC

**What happened.** Test accounts need a trustline and then USDC from Circle's faucet, and it all goes away with each testnet reset. We did not want a manual step in an automated test.

**Cost.** About an hour.

**Workaround.** `test/fund.mjs` swaps the test account's XLM for USDC and EURC on the testnet DEX with `pathPaymentStrictSend`. Issuer addresses per network are pinned in `src/shared/logic.js` and were cross-checked against Horizon's `/assets` rather than copied from docs.

### 3.6 The official resource-limits page was stale

**What happened.** In October the limits page on developers.stellar.org still said 100 M instructions and 70 KB per transaction. The network (protocol 29, read over RPC) gives 400 M instructions, 132,096 bytes per transaction and 131,072 bytes of Wasm. For the STARK verifier this is the difference between "impossible" and "fits four times over", and an AI agent takes the docs at face value.

**Cost.** About an hour to doubt the page and read the real numbers from RPC and the `soroban-env-host` source; some early sizing in the parallel project was done against the wrong numbers.

**Workaround.** Treat the network as the source of truth: limits from RPC, cost parameters from `soroban-env-host` 29.0.1 (`budget.rs`, `env.json`).

### 3.7 We only found Raven on day one of the hackathon

**What happened.** For three weeks of building, documentation came from the website, GitHub source and the network. On 25 October Carlos asked whether we were using Raven; we were not. It is not in the directory of connectors of the AI tool we use, so it has to be added as a custom MCP server with a browser sign-in, and the official "Building with AI" page still pointed at `raven.stellar.buzz` while the canonical address is `raven.stellar.org`.

**Cost.** Small once connected. The cost was not having it earlier. On the LOBSTR problem it returned the dapp skill's wallet-integration section and doc hits, none about iOS deep links. Later, for ecosystem questions (similar past SCF submissions, open RFPs, who built what), it was useful and fast.

**Workaround.** Added it as a custom connector; used it alongside the sources above, not instead of them, since it searches the same docs.

### 3.8 CCTP into Stellar: works, but it is the most hands-on destination (pre-event spike, not in the submission)

**What happened.** On 2 October we ran Circle's Arc → Stellar quickstart on testnet: three 1-USDC transfers delivered to a contract address in 15.6, 20.4 and 27.3 s. What slowed us down: Circle does not forward the mint into Stellar, so the app itself has to call `mint_and_forward` on the forwarder contract and pay for it; on the burn side `mintRecipient` and `destinationCaller` must both be the forwarder or the funds are locked with no recovery (the docs say so, but it is an easy mistake with no safety net); Stellar uses 7 decimals and CCTP messages 6; standard-mode transfers from Base take 15–19 minutes, so a demo needs fast mode.

**Cost.** About 4 hours for the spike. CCTP pay-ins from Base and Solana were in our application for the event; at the event we built the round instead and left CCTP as "next".

### 3.9 Papercuts

- `@stellar/stellar-sdk`: the resources on a simulation are properties, not methods (`res.instructions` vs `res.instructions()`); 10 minutes, but the kind of thing an agent gets wrong from older examples.
- Instructions declared by simulation are a little above what runs, and the fee quoted differs from the fee charged on Horizon. Which number goes in a cost table? Half an hour of head-scratching; we report charged fees and declared instructions, and say so.
- Testnet's fee parameters were halved in mid-October; cost tables from different days do not match.
- There is no headless Stellar wallet for end-to-end tests. Playwright covers the modal and the links it opens (`test/wc-smoke.mjs`, `test/lobstr-link.mjs`); real pairing and signing only happen on real phones, which is why 3.1 surfaced at the venue and not in CI.

### 3.10 From the parallel STARK verifier (Soroban-heavy)

- **Installing `stellar-cli` with `cargo install`** is a long compile; it failed once (out of memory) in our build container and had to be rerun with fewer parallel jobs. About 40 minutes.
- **`soroban-sdk` 29 expects to be built by `stellar contract build`.** A plain `cargo build` fails in the SDK's build script unless `SOROBAN_SDK_BUILD_SYSTEM_SUPPORTS_SPEC_SHAKING_V2=1` is set. We needed cargo directly for `-Zbuild-std`; found the variable by reading `build.rs`. About an hour.
- **The 128 KiB Wasm limit and the 67-fuel charge per Wasm `call`** pull in opposite directions: inlining makes the verifier 2.5× cheaper and 20 KB bigger. Fitting at opt-level `s` needed nightly, `-Zbuild-std`, `-Zlocation-detail=none`, `-Zfmt-debug=none` and `panic=immediate-abort`. Days of tuning, though that is the nature of the project.
- **No per-function cost profiler.** To learn where the instructions go we patched `soroban-wasmi` to attribute fuel per function and built phase probes. About a day.
- **Testnet archives a contract 7 days after its last TTL extension**, and calls fail until it is restored: a demo can silently die. We wrote `extend-ttl.mjs` and extend by hand. **Uploading 126 KB to mainnet costs about 205 XLM** (almost all rent for the 120-day minimum), which is why that demo stayed on testnet.
- **No Blake2s host function.** Hashing with the native `keccak256` instead costs about the same as Blake2s compiled into the contract, so STARK verifiers pay for their hashing in Wasm either way.

## 4. What worked well

- **The protocol's primitives made the product possible.** `ed25519_verify` and `sha256` as host functions, temporary storage and events gave us a fair commit-reveal game with no wallet and no account for the players, for 0.007 XLM per round. The contract went from an empty folder to tested and deployed on testnet in a few hours on 25 October, and was on mainnet by 18:54.
- **`stellar contract build` is reproducible.** The same Wasm hash on testnet and mainnet; anyone can rebuild and compare. `optimize`, `upload --source <identity>` and `deploy --alias` did what they say.
- **Simulation tells you the exact cost.** Every row in `contracts/README.md` (instructions and fee per transaction) comes from the network, not from guesses.
- **Horizon is simple enough to use with `fetch` and no SDK** in a Cloudflare Worker: payments, memos, trustlines, order book. The `join=transactions` parameter saved a round trip per payment.
- **The JS SDK's RPC loop** (simulate → assemble → send → poll) runs fine inside a Durable Object; one relay account sends a whole round, batching seals and openings.
- **Fast ledgers.** Five-second finality makes "seal, wait for everyone, open" feel like a game, not a queue.
- **SEP-7**, a standard from 2018, saved the night on iOS: LOBSTR opens `web+stellar:pay` with destination, amount and memo filled in, and the same link is the QR on desktop.
- **Stellar Wallets Kit on desktop** went in without drama: six wallet modules, one import each.
- **Friendbot, the testnet DEX, stellar.expert and Lab** are the kind of tooling you stop noticing, which is the compliment.
- **Raven**, once connected, is a good way to ask the ecosystem questions a website cannot answer.

## 5. What would have made building on Stellar easier

1. **A tested, documented path for phone wallets.** One page that says: on iOS, these wallets pair over WalletConnect app-to-app, these only by QR, these honour SEP-7 links; with the registry IDs and the right universal links. LOBSTR's registry entry should open its universal link, not the `lobstr://` scheme. Until pairing is reliable, the dapp docs could recommend SEP-7 payment links as the first option on phones.
2. **Explain surprising fees.** When testnet rent surges, the CLI and the SDK could say so ("rent is in surge pricing: live state above target"), and the storage docs could warn that persistent entries with a long TTL are quoted in thousands of testnet XLM during a surge. A one-line hint would have saved the redeploy.
3. **A USDC faucet for testnet that needs no clicking**: an account, its trustline and some USDC in one call, like Friendbot. We rebuilt it from the DEX.
4. **Keep the limits page in sync with the network**, or generate it from RPC. A stale number in an official page costs more than a missing one, especially for AI agents.
5. **Raven in the connector directories of the AI tools people use**, and one canonical address in the docs. We would have had it from day one.
6. **A headless test wallet** (a Stellar Wallets Kit module backed by a local keypair, or a Playwright fixture) so wallet flows can run in CI.
7. **A `cargo build` that just works for `soroban-sdk`** without the environment variable, or at least a documented one, for people who need `-Zbuild-std`.
8. **A per-function cost profiler** in `stellar-cli` or the SDK's `testutils`: instructions per function from a real run, the way `cargo flamegraph` does for native code.
9. **A warning, not a footnote, on CCTP's locked-funds case**, and a Circle-run forwarder for Stellar like other chains have, so apps do not have to mint for their users.
10. **For proof systems on Soroban** (from the parallel project): a Merkle-path verification host function, a lighter charge per Wasm `call`, and either a bigger contract size limit or a way to upload a mainnet contract with a shorter TTL than 120 days. We can share the measurements.

## 6. Not Stellar's fault, but it cost us time

- Cloudflare's Encrypted Client Hello on our zone: two friends at the venue could not open the site in Chrome ("site can't be reached") while everyone else could. Turned off by API.
- The git proxy of our coding environment does not push tags; the `pre-hackmeridian` marker is a branch for that reason.
- Our AI coding agent's safety filters got in the way when code touched seed and key generation for the account-recovery prototype; that variant was estimated on paper instead of built.
