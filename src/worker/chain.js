// Talks to the whopays contract on Stellar: builds, signs and sends the transactions that relay
// the players' sealed and opened moves. Used by the Worker (ChainDO) and by contracts/scripts.
// Players never need a Stellar account: their moves are signed with the key in their browser and
// relayed here by one funded account (the "admin" of the contract).
import { Address, Contract, Keypair, Networks, Operation, TransactionBuilder, nativeToScVal, scValToNative, xdr, rpc } from '@stellar/stellar-sdk';

export const NETS = {
  testnet: { rpc: 'https://soroban-testnet.stellar.org', passphrase: Networks.TESTNET, explorer: 'https://stellar.expert/explorer/testnet', friendbot: 'https://friendbot.stellar.org' },
  public: { rpc: 'https://mainnet.sorobanrpc.com', passphrase: Networks.PUBLIC, explorer: 'https://stellar.expert/explorer/public' },
};

const bytes = b => nativeToScVal(Buffer.from(b), { type: 'bytes' });
const u32 = n => nativeToScVal(Number(n), { type: 'u32' });
const sym = s => xdr.ScVal.scvSymbol(s);
// Contract structs are maps keyed by field name, sorted by key.
const struct = fields => xdr.ScVal.scvMap(Object.keys(fields).sort().map(k => new xdr.ScMapEntry({ key: sym(k), val: fields[k] })));

export const args = {
  create: (game, players, maxCoins, commitLedgers, revealLedgers) => [bytes(game), xdr.ScVal.scvVec(players.map(bytes)), u32(maxCoins), u32(commitLedgers), u32(revealLedgers)],
  commit: (game, player, commitment, sig) => [bytes(game), bytes(player), bytes(commitment), bytes(sig)],
  commit_many: (game, sealed) => [bytes(game), xdr.ScVal.scvVec(sealed.map(s => struct({ player: bytes(s.player), commitment: bytes(s.commitment), sig: bytes(s.sig) })))],
  close: game => [bytes(game)],
  reveal: (game, player, coins, guess, salt) => [bytes(game), bytes(player), u32(coins), u32(guess), bytes(salt)],
  reveal_many: (game, opened) => [bytes(game), xdr.ScVal.scvVec(opened.map(o => struct({ player: bytes(o.player), coins: u32(o.coins), guess: u32(o.guess), salt: bytes(o.salt) })))],
  settle: game => [bytes(game)],
  game: game => [bytes(game)],
};

const h = b => Buffer.from(b).toString('hex');
// A Game as the contract returns it, with bytes as hex and maps as plain objects.
export function plainGame(v) {
  if (!v) return null;
  const map = m => { const o = {}; if (m instanceof Map) for (const [k, x] of m) o[k] = x; else if (m) for (const k of Object.keys(m)) o[k] = m[k]; return o; };
  const commits = map(v.commits), moves = map(v.moves);
  return {
    players: v.players.map(h), maxCoins: Number(v.max_coins), createdAt: Number(v.created_at), commitUntil: Number(v.commit_until),
    revealLedgers: Number(v.reveal_ledgers), revealUntil: Number(v.reveal_until), phase: Number(v.phase), active: v.active.map(Number),
    commits: Object.fromEntries(Object.entries(commits).map(([k, c]) => [k, h(c)])),
    moves: Object.fromEntries(Object.entries(moves).map(([k, m]) => [k, { coins: Number(m.coins), guess: Number(m.guess), salt: h(m.salt) }])),
    settled: !!v.settled, loser: Number(v.loser), total: Number(v.total), reason: Number(v.reason), drawn: !!v.drawn, settledAt: Number(v.settled_at),
  };
}

export class ContractError extends Error {
  constructor(code, detail) { super(`contract error #${code}`); this.code = code; this.detail = detail; }
}

// Error(Contract, #n) in a simulation's error text or a failed transaction's result.
export function contractErrorCode(text) {
  const m = /Error\(Contract, #(\d+)\)/.exec(String(text || ''));
  return m ? Number(m[1]) : null;
}

export class Chain {
  constructor({ network = 'testnet', secret, contractId, rpcUrl }) {
    this.net = NETS[network] || NETS.testnet;
    this.server = new rpc.Server(rpcUrl || this.net.rpc, { allowHttp: false });
    this.kp = secret ? Keypair.fromSecret(secret) : null;
    this.contractId = contractId;
    this.explorer = this.net.explorer;
  }

  async health() { return this.server.getHealth(); }
  async ledger() { return (await this.server.getLatestLedger()).sequence; }

  // Simulates a call without sending anything (also how the Worker reads state).
  async read(fn, a) {
    const account = await this.server.getAccount(this.kp.publicKey());
    const tx = new TransactionBuilder(account, { fee: '100', networkPassphrase: this.net.passphrase })
      .addOperation(new Contract(this.contractId).call(fn, ...a)).setTimeout(60).build();
    const sim = await this.server.simulateTransaction(tx);
    if (!rpc.Api.isSimulationSuccess(sim)) throw new ContractError(contractErrorCode(sim.error), sim.error);
    return sim.result ? scValToNative(sim.result.retval) : null;
  }

  async game(gameId) { return plainGame(await this.read('game', args.game(gameId))); }

  // Sends one invocation and waits for it. Returns { hash, ledger, value, instructions, fee }.
  async send(fn, a, { label = fn, timeout = 90 } = {}) {
    const account = await this.server.getAccount(this.kp.publicKey());
    const tx = new TransactionBuilder(account, { fee: '200000', networkPassphrase: this.net.passphrase })
      .addOperation(new Contract(this.contractId).call(fn, ...a)).setTimeout(timeout).build();
    const sim = await this.server.simulateTransaction(tx);
    if (!rpc.Api.isSimulationSuccess(sim)) throw new ContractError(contractErrorCode(sim.error), `${label}: ${sim.error}`);
    const prepared = rpc.assembleTransaction(tx, sim).build();
    prepared.sign(this.kp);
    const sent = await this.server.sendTransaction(prepared);
    if (sent.status === 'ERROR') throw new Error(`${label}: send failed: ${JSON.stringify(sent.errorResult)}`);
    const done = await this.wait(sent.hash);
    if (done.status !== 'SUCCESS') throw new ContractError(contractErrorCode(JSON.stringify(done.resultXdr)), `${label}: ${done.status}`);
    const res = sim.transactionData.build().resources;
    return { hash: sent.hash, ledger: done.ledger, value: done.returnValue ? scValToNative(done.returnValue) : null, instructions: Number(res.instructions), fee: Number(sim.minResourceFee) };
  }

  async wait(hash, tries = 40) {
    for (let i = 0; i < tries; i++) {
      await new Promise(r => setTimeout(r, i < 3 ? 1200 : 2000));
      const r = await this.server.getTransaction(hash);
      if (r.status !== rpc.Api.GetTransactionStatus.NOT_FOUND) return r;
    }
    throw new Error(`transaction ${hash} not found in time`);
  }

  // ---- the contract's functions, with the round's state as the result ----
  create(game, players, maxCoins, commitLedgers, revealLedgers) { return this.send('create', args.create(game, players, maxCoins, commitLedgers, revealLedgers)); }
  async commitMany(game, sealed) { const r = await this.send('commit_many', args.commit_many(game, sealed)); return { ...r, game: plainGame(r.value) }; }
  async revealMany(game, opened) { const r = await this.send('reveal_many', args.reveal_many(game, opened)); return { ...r, game: plainGame(r.value) }; }
  async close(game) { const r = await this.send('close', args.close(game)); return { ...r, game: plainGame(r.value) }; }
  async settle(game) { const r = await this.send('settle', args.settle(game)); return { ...r, game: plainGame(r.value) }; }

  // ---- deployment (scripts only) ----
  async deploy(wasm, admin) {
    const { createHash } = await import('node:crypto');
    const wasmHash = createHash('sha256').update(wasm).digest();
    const up = await this.sendOp(Operation.uploadContractWasm({ wasm }), 'upload');
    const create = await this.sendOp(Operation.createCustomContract({
      address: Address.fromString(this.kp.publicKey()), wasmHash, salt: createHash('sha256').update(`whopays-${Date.now()}`).digest(),
      constructorArgs: [nativeToScVal(Address.fromString(admin || this.kp.publicKey()), { type: 'address' })],
    }), 'create');
    this.contractId = scValToNative(create.done.returnValue);
    return { contractId: this.contractId, uploadTx: up.hash, createTx: create.hash, wasmSha256: wasmHash.toString('hex'), wasmBytes: wasm.length };
  }

  async sendOp(op, label) {
    const account = await this.server.getAccount(this.kp.publicKey());
    const tx = new TransactionBuilder(account, { fee: '1000000', networkPassphrase: this.net.passphrase }).addOperation(op).setTimeout(120).build();
    const sim = await this.server.simulateTransaction(tx);
    if (!rpc.Api.isSimulationSuccess(sim)) throw new Error(`${label}: simulation failed: ${sim.error}`);
    const prepared = rpc.assembleTransaction(tx, sim).build();
    prepared.sign(this.kp);
    const sent = await this.server.sendTransaction(prepared);
    if (sent.status === 'ERROR') throw new Error(`${label}: send failed: ${JSON.stringify(sent.errorResult)}`);
    const done = await this.wait(sent.hash, 60);
    if (done.status !== 'SUCCESS') throw new Error(`${label}: ${done.status}`);
    return { hash: sent.hash, done };
  }
}

export async function fundOnTestnet(publicKey) {
  const r = await fetch(`${NETS.testnet.friendbot}/?addr=${publicKey}`);
  if (!r.ok && r.status !== 400) throw new Error(`friendbot ${r.status}: ${await r.text()}`);
  return r.ok;
}
