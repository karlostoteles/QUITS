// Paying from a Stellar wallet. Loaded on demand: only people who tap a wallet option download this.
// Quits builds the payment, the person's wallet signs it, and it goes straight to the host's wallet.
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { FreighterModule } from '@creit.tech/stellar-wallets-kit/modules/freighter';
import { xBullModule } from '@creit.tech/stellar-wallets-kit/modules/xbull';
import { LobstrModule } from '@creit.tech/stellar-wallets-kit/modules/lobstr';
import { AlbedoModule } from '@creit.tech/stellar-wallets-kit/modules/albedo';
import { RabetModule } from '@creit.tech/stellar-wallets-kit/modules/rabet';
import { HanaModule } from '@creit.tech/stellar-wallets-kit/modules/hana';
import { SwkAppDarkTheme, Networks } from '@creit.tech/stellar-wallets-kit/types';
import { TransactionBuilder, Operation, Asset, Memo, Account } from '@stellar/stellar-sdk';
import { NETWORKS } from '../shared/logic.js';

const THEME = {
  ...SwkAppDarkTheme,
  background: '#111934', 'background-secondary': '#0A0F20',
  'foreground-strong': '#EEF1F8', foreground: '#EEF1F8', 'foreground-secondary': '#959EC0',
  primary: '#FFE45C', 'primary-foreground': '#15151A',
  'light-gray': '#26305A', gray: '#5B6590', border: 'rgba(38,48,90,.9)',
  shadow: '0 30px 80px -20px rgba(0,0,0,.8)', 'border-radius': '16px',
  'font-family': '"Instrument Sans", system-ui, sans-serif',
};

const STELLAR_WC_WALLETS = [
  '997a355c8f682468706a76cff1b004a7115f505fb962dac54b6e9b442dd1c380', // Freighter
  '76a3d548a08cf402f5c7d021f24fd2881d767084b387a5325df88bc3d4b6f21b', // LOBSTR
  '9c78aee7d8a771255942334d06d2cbab89e2178ee49fee4ea3b6c78032fcac76', // Scopuly
];

let kitFor = null; // which set of wallets the kit was started with: 'browser' | 'app'

const passphrase = net => (net === 'public' ? Networks.PUBLIC : Networks.TESTNET);
const label = net => (net === 'public' ? 'Stellar' : 'Stellar testnet');
const why = e => (e && (e.message || (typeof e === 'string' ? e : ''))) || 'Something went wrong in the wallet.';
const fail = msg => { throw new Error(msg); };

async function startKit(health, kind, network) {
  if (kitFor === kind) { StellarWalletsKit.setNetwork(passphrase(network)); return; }
  let modules;
  if (kind === 'app') {
    if (!health.wc) fail('Wallet apps are not set up here yet. Send it yourself instead.');
    const wc = await import('@creit.tech/stellar-wallets-kit/modules/wallet-connect');
    const mod = new wc.WalletConnectModule({
      projectId: health.wc,
      metadata: { name: 'Quits', description: 'Split the bill at the table', url: location.origin, icons: [location.origin + '/icon-512.png'] },
      allowedChains: [network === 'public' ? wc.WalletConnectTargetChain.PUBLIC : wc.WalletConnectTargetChain.TESTNET],
      // only wallets that speak Stellar over WalletConnect: Freighter, LOBSTR, Scopuly
      appKitOptions: {
        includeWalletIds: STELLAR_WC_WALLETS, featuredWalletIds: STELLAR_WC_WALLETS,
        themeMode: 'dark', themeVariables: { '--w3m-font-family': '"Instrument Sans", system-ui, sans-serif', '--w3m-z-index': 1000 },
      },
    });
    // WalletConnect starts in the background; give it a few seconds.
    for (let i = 0; i < 50 && !(await mod.isAvailable()); i++) await new Promise(r => setTimeout(r, 100));
    if (!(await mod.isAvailable())) fail('Couldn’t reach WalletConnect. Check your connection and try again.');
    modules = [mod];
  } else modules = [new FreighterModule(), new xBullModule(), new LobstrModule(), new AlbedoModule(), new RabetModule(), new HanaModule()];
  StellarWalletsKit.init({ modules, network: passphrase(network), theme: THEME, authModal: { showInstallLabel: true, hideUnsupportedWallets: false } });
  kitFor = kind;
}

async function pickWallet(kind) {
  try {
    if (kind === 'app') {
      StellarWalletsKit.setWallet('wallet_connect');
      return await StellarWalletsKit.fetchAddress();
    }
    return await StellarWalletsKit.authModal();
  } catch (e) {
    const m = why(e);
    if (/closed the modal|rejected|denied|cancel/i.test(m)) fail('You closed the wallet before it connected.');
    fail(m);
  }
}

// The host's address, from their own wallet (so they don't have to copy it).
export async function connect(health, kind = matchMedia('(pointer: coarse)').matches && health.wc ? 'app' : 'browser') {
  await startKit(health, kind, health.network);
  const { address } = await pickWallet(kind);
  return { address, wallet: StellarWalletsKit.selectedModule.productName };
}

async function horizon(net, path, init) {
  const r = await fetch(NETWORKS[net].horizon + path, init);
  let j = null;
  try { j = await r.json(); } catch (e) { /* empty */ }
  return { status: r.status, ok: r.ok, j };
}

function friendly(codes, asset) {
  const ops = (codes && codes.operations) || [], tx = codes && codes.transaction;
  if (ops.includes('op_underfunded')) return `There isn’t enough ${asset} in this wallet.`;
  if (ops.includes('op_src_no_trust')) return `This wallet doesn’t hold ${asset}. Pick the other currency, or send it yourself from a wallet that has it.`;
  if (ops.includes('op_no_trust') || ops.includes('op_no_destination')) return `The host’s wallet can’t receive ${asset} right now. Pay another way.`;
  if (ops.includes('op_line_full')) return 'The host’s wallet can’t take more of this currency.';
  if (tx === 'tx_insufficient_balance') return 'Your wallet needs a little more XLM to pay the network fee.';
  if (tx === 'tx_bad_seq') return 'Your wallet was busy with another payment. Try again.';
  if (tx === 'tx_too_late') return 'The payment waited too long for approval. Try again.';
  if (tx === 'tx_bad_auth') return 'The wallet signed for a different account. Try again.';
  return `Stellar didn’t accept the payment (${(ops.find(o => o !== 'op_success') || tx || 'unknown')}).`;
}

// Pay the host: build the payment, have the wallet sign it, send it to Stellar. Returns the transaction hash.
export async function pay(health, { network, to, asset, amount, memo, kind }) {
  await startKit(health, kind, network);
  const { address } = await pickWallet(kind);
  const net = NETWORKS[network], issuer = net.assets[asset];

  // Check the wallet can pay before asking for a signature.
  const acc = await horizon(network, `/accounts/${address}`);
  if (acc.status === 404) fail(`This wallet has no account on ${label(network)} yet.`);
  if (!acc.ok) fail('Couldn’t reach Stellar. Try again in a moment.');
  const bal = (acc.j.balances || []).find(b => b.asset_code === asset && b.asset_issuer === issuer);
  if (!bal) fail(`This wallet doesn’t hold ${asset}${network === 'public' ? ' from Circle' : ''}. Pick the other currency, or send it yourself from a wallet that has it.`);
  if (Number(bal.balance) < Number(amount)) fail(`This wallet has ${Number(bal.balance).toFixed(2)} ${asset}; you need ${amount}.`);

  const tx = new TransactionBuilder(new Account(address, acc.j.sequence), { fee: '10000', networkPassphrase: net.passphrase })
    .addOperation(Operation.payment({ destination: to, asset: new Asset(asset, issuer), amount: String(amount) }))
    .addMemo(Memo.text(memo))
    .setTimeout(600)
    .build();

  let signed;
  try {
    ({ signedTxXdr: signed } = await StellarWalletsKit.signTransaction(tx.toXDR(), { networkPassphrase: net.passphrase, address }));
  } catch (e) {
    const m = why(e);
    if (/reject|denied|declin|cancel|closed/i.test(m)) fail('You didn’t approve the payment in the wallet.');
    if (/network/i.test(m)) fail(`Your wallet is on another network. Switch it to ${label(network)} and try again.`);
    fail(m);
  }
  if (!signed) fail('The wallet didn’t return a signed payment.');
  const hash = TransactionBuilder.fromXDR(signed, net.passphrase).hash().toString('hex');

  const sub = await horizon(network, '/transactions', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'tx=' + encodeURIComponent(signed) });
  if (!sub.ok && sub.status !== 504) fail(friendly(sub.j && sub.j.extras && sub.j.extras.result_codes, asset));
  return { hash: (sub.j && sub.j.hash) || hash, wallet: StellarWalletsKit.selectedModule.productName, from: address };
}
