# whopays: the contract that judges the round

Who pays the bill? Everyone at the table hides 0–3 coins and calls the total; the player furthest from the real total pays for everyone who played. The contract makes it fair without anyone trusting anyone: moves are **sealed** first and **opened** later, and silence loses.

## Rules, as the contract enforces them

| Step | Who | What the contract checks |
|---|---|---|
| `create(game, players, max_coins, commit_ledgers, reveal_ledgers)` | the admin (Quits' relay account) | 2–24 distinct Ed25519 public keys; `max_coins` 1–9 |
| `commit(game, player, commitment, sig)` / `commit_many(game, [...])` | anyone, on a player's behalf | the player is in the round and has not sealed; `sig` is the player's Ed25519 signature of `"QUITS/commit" ‖ game ‖ commitment` (checked with the host's `ed25519_verify`; a bad one traps). When the last player seals, the reveal window opens: `reveal_until = now + reveal_ledgers` |
| `close(game)` | the admin any time; anyone after `commit_until` | drops the players who have not sealed and opens the reveal window, or cancels the round if fewer than two sealed |
| `reveal(game, player, coins, guess, salt)` / `reveal_many(game, [...])` | anyone, on a player's behalf | still inside the window; `coins ≤ max_coins`, `guess ≤ max_coins × players`; `SHA-256("QUITS/c" ‖ game ‖ player ‖ coins ‖ guess ‖ salt)` equals the seal. The last opening settles the round |
| `settle(game)` | anyone | after the window: whoever did not open loses (several: drawn); otherwise the furthest guess loses (ties: drawn) |
| `game(game)` | anyone | the round's state while it lives (an hour in temporary storage) |
| `commitment(game, player, coins, guess, salt)` | anyone | the hash a phone must produce, for tests and other clients |

The draw seed is `SHA-256("QUITS/draw" ‖ game ‖ salt₁ ‖ … ‖ saltₙ)` over the opened salts in player order. Every salt was fixed inside a seal before any move was opened, so nobody can steer the draw; the only thing the last player can do is not open, and lose.

Errors: `NoSuchGame` 1, `GameExists` 2, `BadParams` 3, `WrongPhase` 4, `NotAPlayer` 5, `AlreadySealed` 6, `AlreadyOpened` 7, `TooLate` 8, `BadReveal` 9, `BadMove` 10, `NotYet` 11. A forged signature is a `Crypto, InvalidInput` trap.

Events: `created`, `sealed`, `opening`, `opened`, `settled` (loser, total, reason, drawn), `cancelled`.

## What it costs (mainnet, protocol 29, 25 Oct 2026)

| Transaction | Instructions | Fee |
|---|---|---|
| `create`, 3 players | 727,384 | 0.00167 XLM |
| `commit_many`, 1 seal | 1,254,064 | 0.00116 XLM |
| `commit_many`, 2 seals (opens the reveal window) | 1,800,834 | 0.00139 XLM |
| `reveal_many`, 1 opening | 890,775 | 0.00128 XLM |
| `reveal_many`, 2 openings (settles the round) | 1,187,987 | 0.00163 XLM |

A three-player round is five transactions and 0.007 XLM. Uploading the 16 KB of Wasm and creating the contract cost 18.4 XLM, once. The round is in [`deployments/public.json`](deployments/public.json), with the transaction hashes.

### On testnet the same week

| Transaction | Instructions | Fee |
|---|---|---|
| `create`, 3 players | 727,384 | 0.0525 XLM |
| `commit_many`, 1 seal | 1,254,064 | 0.0046 XLM |
| `commit_many`, 2 seals (opens the reveal window) | 1,800,834 | 0.0083 XLM |
| `reveal_many`, 1 opening | 890,775 | 0.0099 XLM |
| `reveal_many`, 2 openings (settles the round) | 1,128,217 | 0.0189 XLM |
| `settle` after a timeout | 891,924 | 0.0012 XLM |

About 0.1 XLM per round: testnet's rent was in surge pricing that week (the live Soroban state was above its target size, which is also why uploading the Wasm there was quoted at ~2,700 testnet XLM and went through a fee bump). Rounds therefore live in temporary storage with the shortest TTL the network allows (720 ledgers, about an hour): the transactions and their events are the record, and Quits keeps the verdict with the night.

## Build, test, deploy

```
cargo test -p whopays                         # 10 tests: rules, forged seals, timeouts, draws
stellar contract build --package whopays      # target/wasm32v1-none/release/whopays.wasm
stellar contract optimize --wasm target/wasm32v1-none/release/whopays.wasm
cd scripts && npm install && cd ..
node scripts/whopays.mjs deploy               # uploads, creates the contract with this account as admin
node scripts/whopays.mjs round 3              # a full round with three in-memory players
node scripts/whopays.mjs silent               # one player never opens; settled by timeout
node scripts/whopays.mjs forged               # a seal with the wrong signature is refused
```

The relay account's key lives in `.keys/<network>.json` (git-ignored; on testnet it is made and funded by friendbot on first use, on mainnet `NETWORK=public node scripts/whopays.mjs deploy` prints the address to fund, about 20 XLM for the upload and the contract). Deployments and the rounds played from the script are logged in `deployments/<network>.json`.

- Mainnet: `CAYHWHSNRG6R436BHAHI4Y6IXVPWS3ZTEUBSGZ7ORHSYAK2ORE5UH5UA` ([stellar.expert](https://stellar.expert/explorer/public/contract/CAYHWHSNRG6R436BHAHI4Y6IXVPWS3ZTEUBSGZ7ORHSYAK2ORE5UH5UA)), admin `GBCLXIKXD7SKSCNT6MXZY2WOOVQBEI7T4O3NOCWG2BB5FC5QGOSNFF4U`. The live app uses this one.
- Testnet: `CAQOQKI4GOX36MPWTYK27TNJB32I5VRLEHGADOUHOFUBMISUWIUHH5J2` ([stellar.expert](https://stellar.expert/explorer/testnet/contract/CAQOQKI4GOX36MPWTYK27TNJB32I5VRLEHGADOUHOFUBMISUWIUHH5J2)).

Both run the same Wasm, `b06ead9fdff2940aac99a6871adcf1f0596e21bc78f9cffb00a7a3dc50eff23e` (16,080 bytes): `stellar contract build` is reproducible, so anyone can rebuild it and compare the hash.

## What it does not do

- It holds no money. It decides who pays a bill the group already owes; the payment goes wallet to wallet through Quits, or in cash.
- It is not audited, and it is a hackathon build.
- The relay account pays the fees and is the only one that can create rounds, but it cannot forge a move (each seal carries the player's signature) or hide one (anyone can relay a seal or an opening, and anyone can settle after the window).
