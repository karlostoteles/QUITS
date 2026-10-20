// Creates two testnet accounts (host and guest) with EURC and USDC trustlines, saved to test/.keys.json
import { Keypair, Horizon, TransactionBuilder, Operation, Asset, Networks } from '@stellar/stellar-sdk';
import fs from 'fs';
const hz = new Horizon.Server('https://horizon-testnet.stellar.org');
const EURC = new Asset('EURC', 'GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO');
const USDC = new Asset('USDC', 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');
const file = new URL('./.keys.json', import.meta.url);
let keys = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : {};
for (const who of ['host', 'guest']) {
  if (!keys[who]) { const kp = Keypair.random(); keys[who] = { pub: kp.publicKey(), sec: kp.secret() }; }
  const kp = Keypair.fromSecret(keys[who].sec);
  let acct;
  try { acct = await hz.loadAccount(kp.publicKey()); } catch { 
    const r = await fetch('https://friendbot.stellar.org/?addr=' + kp.publicKey()); console.log(who, 'friendbot', r.status);
    acct = await hz.loadAccount(kp.publicKey());
  }
  const have = new Set(acct.balances.map(b => b.asset_code));
  if (!have.has('EURC') || !have.has('USDC')) {
    const tx = new TransactionBuilder(acct, { fee: '1000', networkPassphrase: Networks.TESTNET })
      .addOperation(Operation.changeTrust({ asset: EURC })).addOperation(Operation.changeTrust({ asset: USDC })).setTimeout(60).build();
    tx.sign(kp); await hz.submitTransaction(tx); console.log(who, 'trustlines added');
  }
  acct = await hz.loadAccount(kp.publicKey());
  console.log(who, kp.publicKey(), acct.balances.map(b => `${b.asset_code || 'XLM'}:${b.balance}`).join(' '));
}
fs.writeFileSync(file, JSON.stringify(keys, null, 2));
