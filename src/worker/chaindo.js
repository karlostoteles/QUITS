// One Durable Object for the whole app relays the game's transactions to Stellar, one at a time,
// from the single funded account that administers the whopays contract. Players never need a
// Stellar account: their moves are signed with the key in their browser and relayed here.
import { DurableObject } from 'cloudflare:workers';
import { Chain, ContractError } from './chain.js';

export class ChainDO extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.chain = env.GAME_SECRET && env.GAME_CONTRACT ? new Chain({ network: env.GAME_NETWORK || 'testnet', secret: env.GAME_SECRET, contractId: env.GAME_CONTRACT }) : null;
    this.queue = Promise.resolve();
  }

  // Runs one transaction after another: one account, one sequence number.
  run(fn) {
    const p = this.queue.then(fn, fn);
    this.queue = p.catch(() => {});
    return p;
  }

  // Turns a contract failure into something the table can store and show.
  wrap(fn) {
    return this.run(async () => {
      try { return { ok: true, ...(await fn()) }; }
      catch (e) {
        if (e instanceof ContractError) return { ok: false, code: e.code, error: e.detail || e.message };
        return { ok: false, code: null, error: String(e.message || e).slice(0, 300) };
      }
    });
  }

  enabled() { return !!this.chain; }
  info() { return this.chain ? { network: this.env.GAME_NETWORK || 'testnet', contract: this.chain.contractId, relayer: this.chain.kp.publicKey(), explorer: this.chain.explorer } : null; }
  async ledger() { return this.chain.ledger(); }
  create(game, players, maxCoins, commitLedgers, revealLedgers) { return this.wrap(() => this.chain.create(hexb(game), players.map(hexb), maxCoins, commitLedgers, revealLedgers)); }
  commitMany(game, sealed) { return this.wrap(() => this.chain.commitMany(hexb(game), sealed.map(s => ({ player: hexb(s.player), commitment: hexb(s.commitment), sig: hexb(s.sig) })))); }
  revealMany(game, opened) { return this.wrap(() => this.chain.revealMany(hexb(game), opened.map(o => ({ player: hexb(o.player), coins: o.coins, guess: o.guess, salt: hexb(o.salt) })))); }
  close(game) { return this.wrap(() => this.chain.close(hexb(game))); }
  settle(game) { return this.wrap(() => this.chain.settle(hexb(game))); }
  async game(game) { try { return await this.run(() => this.chain.game(hexb(game))); } catch (e) { return null; } }
}

const hexb = h => Uint8Array.from((String(h).match(/../g) || []).map(x => parseInt(x, 16)));
