// Gives the test guest some testnet USDC and EURC by swapping its own XLM on the testnet DEX.
import { Keypair, Horizon, TransactionBuilder, Operation, Asset, Networks } from '@stellar/stellar-sdk';
import fs from 'fs';
const hz = new Horizon.Server('https://horizon-testnet.stellar.org');
const keys = JSON.parse(fs.readFileSync(new URL('./.keys.json', import.meta.url)));
const EURC = new Asset('EURC', 'GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO');
const USDC = new Asset('USDC', 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');
const who = process.argv[2] || 'guest';
const kp = Keypair.fromSecret(keys[who].sec);
const acct = await hz.loadAccount(kp.publicKey());
const tx = new TransactionBuilder(acct, { fee: '2000', networkPassphrase: Networks.TESTNET })
  .addOperation(Operation.pathPaymentStrictSend({ sendAsset: Asset.native(), sendAmount: process.argv[3] || '300', destination: kp.publicKey(), destAsset: USDC, destMin: '1', path: [] }))
  .addOperation(Operation.pathPaymentStrictSend({ sendAsset: Asset.native(), sendAmount: process.argv[4] || '600', destination: kp.publicKey(), destAsset: EURC, destMin: '1', path: [USDC] }))
  .setTimeout(60).build();
tx.sign(kp);
await hz.submitTransaction(tx);
const a = await hz.loadAccount(kp.publicKey());
console.log(who, a.balances.map(b => `${b.asset_code || 'XLM'}:${b.balance}`).join(' '));
