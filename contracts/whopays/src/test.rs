#![cfg(test)]
extern crate std;
use super::*;
use ed25519_dalek::{Signer, SigningKey};
use sha2::{Digest, Sha256};
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{vec, Address, Env};

struct Player {
    key: SigningKey,
}

impl Player {
    fn new(seed: u8) -> Self {
        Player { key: SigningKey::from_bytes(&[seed; 32]) }
    }
    fn pk(&self, env: &Env) -> BytesN<32> {
        BytesN::from_array(env, &self.key.verifying_key().to_bytes())
    }
    fn commitment(&self, env: &Env, game: &BytesN<32>, coins: u32, guess: u32, salt: &[u8; 32]) -> BytesN<32> {
        let mut h = Sha256::new();
        h.update(COMMIT_TAG);
        h.update(game.to_array());
        h.update(self.key.verifying_key().to_bytes());
        h.update([coins as u8, guess as u8]);
        h.update(salt);
        BytesN::from_array(env, &h.finalize().into())
    }
    fn sign(&self, env: &Env, game: &BytesN<32>, commitment: &BytesN<32>) -> BytesN<64> {
        let mut msg = SIGN_TAG.to_vec();
        msg.extend_from_slice(&game.to_array());
        msg.extend_from_slice(&commitment.to_array());
        BytesN::from_array(env, &self.key.sign(&msg).to_bytes())
    }
}

struct Table {
    env: Env,
    client: WhoPaysClient<'static>,
    game: BytesN<32>,
    players: std::vec::Vec<Player>,
}

fn setup(n: usize) -> Table {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let id = env.register(WhoPays, (admin,));
    let client = WhoPaysClient::new(&env, &id);
    let players: std::vec::Vec<Player> = (1..=n as u8).map(Player::new).collect();
    let game = BytesN::from_array(&env, &[7u8; 32]);
    let mut keys = Vec::new(&env);
    for p in &players {
        keys.push_back(p.pk(&env));
    }
    client.create(&game, &keys, &3, &60, &36);
    Table { env, client, game, players }
}

fn salt(k: u8) -> [u8; 32] {
    [k; 32]
}

/// (loser, total, reason, drawn) of a settled round.
fn outcome(g: &Game) -> (u32, u32, Reason, bool) {
    assert!(g.settled && g.phase == Phase::Done);
    (g.loser, g.total, g.reason, g.drawn)
}

impl Table {
    fn commit(&self, i: usize, coins: u32, guess: u32) -> Game {
        let p = &self.players[i];
        let c = p.commitment(&self.env, &self.game, coins, guess, &salt(i as u8 + 100));
        let sig = p.sign(&self.env, &self.game, &c);
        self.client.commit(&self.game, &p.pk(&self.env), &c, &sig)
    }
    fn reveal(&self, i: usize, coins: u32, guess: u32) -> Game {
        let p = &self.players[i];
        self.client.reveal(&self.game, &p.pk(&self.env), &coins, &guess, &BytesN::from_array(&self.env, &salt(i as u8 + 100)))
    }
    fn try_reveal(&self, i: usize, coins: u32, guess: u32) -> Result<Game, Error> {
        let p = &self.players[i];
        self.client
            .try_reveal(&self.game, &p.pk(&self.env), &coins, &guess, &BytesN::from_array(&self.env, &salt(i as u8 + 100)))
            .map(|r| r.unwrap())
            .map_err(|e| e.unwrap())
    }
    fn advance(&self, ledgers: u32) {
        self.env.ledger().with_mut(|l| l.sequence_number += ledgers);
    }
}

#[test]
fn furthest_guess_pays() {
    let t = setup(3);
    // Sealing: the phase opens for reveals once the last player has sealed.
    assert_eq!(t.commit(0, 2, 5).phase, Phase::Commit);
    assert_eq!(t.commit(1, 1, 4).phase, Phase::Commit);
    let g = t.commit(2, 3, 9);
    assert_eq!(g.phase, Phase::Reveal);
    assert_eq!(g.reveal_until, t.env.ledger().sequence() + 36);
    // Opening: total is 6; guesses 5, 4, 9 -> player 2 (distance 3) pays.
    assert_eq!(t.reveal(0, 2, 5).phase, Phase::Reveal);
    assert_eq!(t.reveal(1, 1, 4).phase, Phase::Reveal);
    let g = t.reveal(2, 3, 9);
    assert_eq!(g.phase, Phase::Done);
    assert_eq!(outcome(&g), (2, 6, Reason::Furthest, false));
    assert_eq!(t.client.game(&t.game).unwrap().loser, 2);
}

#[test]
fn ties_are_drawn_from_the_salts() {
    let t = setup(2);
    t.commit(0, 1, 0);
    t.commit(1, 1, 4);
    t.reveal(0, 1, 0);
    let g = t.reveal(1, 1, 4); // total 2: both guesses are 2 away
    let (loser, _, reason, drawn) = outcome(&g);
    assert!(drawn);
    assert_eq!(reason, Reason::Furthest);
    // The draw is reproducible from public data: the two salts in player order.
    let mut h = Sha256::new();
    h.update(DRAW_TAG);
    h.update(t.game.to_array());
    h.update(salt(100));
    h.update(salt(101));
    let d: [u8; 32] = h.finalize().into();
    let expect = u32::from_be_bytes([d[0], d[1], d[2], d[3]]) % 2;
    assert_eq!(loser, expect);
}

#[test]
fn silence_loses() {
    let t = setup(3);
    t.commit(0, 0, 3);
    t.commit(1, 3, 3);
    t.commit(2, 1, 3);
    t.reveal(0, 0, 3);
    t.reveal(1, 3, 3);
    // Player 2 never opens. Nobody can settle before the window closes...
    assert_eq!(t.client.try_settle(&t.game).err().unwrap().unwrap(), Error::NotYet);
    t.advance(37);
    // ...and afterwards their reveal is refused and anyone can settle.
    assert_eq!(t.try_reveal(2, 1, 3).err().unwrap(), Error::TooLate);
    let g = t.client.settle(&t.game);
    assert_eq!(outcome(&g), (2, 3, Reason::NoReveal, false));
}

#[test]
fn a_reveal_must_match_the_seal() {
    let t = setup(2);
    t.commit(0, 2, 2);
    t.commit(1, 2, 2);
    assert_eq!(t.try_reveal(0, 1, 2).err().unwrap(), Error::BadReveal);
    assert_eq!(t.try_reveal(0, 2, 3).err().unwrap(), Error::BadReveal);
    assert_eq!(t.try_reveal(0, 4, 2).err().unwrap(), Error::BadMove);
    t.reveal(0, 2, 2);
    assert_eq!(t.try_reveal(0, 2, 2).err().unwrap(), Error::AlreadyOpened);
}

#[test]
fn early_close_drops_the_silent_and_needs_two() {
    let t = setup(3);
    t.commit(0, 1, 1);
    t.commit(1, 2, 2);
    // Before commit_until only the admin may close (auths are mocked here); player 2 is dropped.
    let g = t.client.close(&t.game);
    assert_eq!(g.phase, Phase::Reveal);
    assert_eq!(g.active, vec![&t.env, 0u32, 1u32]);
    // A dropped player cannot open a move.
    assert_eq!(t.try_reveal(2, 0, 0).err().unwrap(), Error::NotAPlayer);
    t.reveal(0, 1, 1);
    let g = t.reveal(1, 2, 2);
    assert_eq!(outcome(&g).0, 0); // total 3: guess 1 is further than guess 2

    // With a single sealed move the round is cancelled.
    let t2 = setup(2);
    t2.commit(0, 1, 1);
    t2.advance(61);
    let g = t2.client.close(&t2.game);
    assert_eq!(g.phase, Phase::Done);
    assert!(!g.settled);
}

#[test]
fn sealing_rules() {
    let t = setup(2);
    t.commit(0, 1, 1);
    // No second seal, no strangers.
    let p = &t.players[0];
    let c = p.commitment(&t.env, &t.game, 1, 1, &salt(100));
    let sig = p.sign(&t.env, &t.game, &c);
    assert_eq!(t.client.try_commit(&t.game, &p.pk(&t.env), &c, &sig).err().unwrap().unwrap(), Error::AlreadySealed);
    let stranger = Player::new(99);
    let c2 = stranger.commitment(&t.env, &t.game, 1, 1, &salt(1));
    let sig2 = stranger.sign(&t.env, &t.game, &c2);
    assert_eq!(t.client.try_commit(&t.game, &stranger.pk(&t.env), &c2, &sig2).err().unwrap().unwrap(), Error::NotAPlayer);
    // Unknown round.
    let other = BytesN::from_array(&t.env, &[9u8; 32]);
    assert_eq!(t.client.try_commit(&other, &p.pk(&t.env), &c, &sig).err().unwrap().unwrap(), Error::NoSuchGame);
}

#[test]
#[should_panic]
fn a_forged_seal_is_refused() {
    let t = setup(2);
    let victim = &t.players[0];
    let forger = Player::new(42);
    let c = victim.commitment(&t.env, &t.game, 3, 3, &salt(100));
    let sig = forger.sign(&t.env, &t.game, &c); // signed with the wrong key
    t.client.commit(&t.game, &victim.pk(&t.env), &c, &sig);
}

#[test]
fn batches_do_the_same() {
    let t = setup(3);
    let mut sealed = Vec::new(&t.env);
    let mut opened = Vec::new(&t.env);
    let moves = [(2u32, 4u32), (0, 2), (1, 3)];
    for (i, p) in t.players.iter().enumerate() {
        let (coins, guess) = moves[i];
        let c = p.commitment(&t.env, &t.game, coins, guess, &salt(i as u8));
        sealed.push_back(Sealed { player: p.pk(&t.env), commitment: c.clone(), sig: p.sign(&t.env, &t.game, &c) });
        opened.push_back(Opened { player: p.pk(&t.env), coins, guess, salt: BytesN::from_array(&t.env, &salt(i as u8)) });
    }
    assert_eq!(t.client.commit_many(&t.game, &sealed).phase, Phase::Reveal);
    let g = t.client.reveal_many(&t.game, &opened);
    let (loser, total, reason, drawn) = outcome(&g);
    assert_eq!((total, reason, drawn), (3, Reason::Furthest, true)); // guesses 4,2,3 vs total 3: players 0 and 1 are 1 away -> drawn
    assert!(loser == 0 || loser == 1);
}

#[test]
fn the_commitment_helper_matches() {
    let t = setup(2);
    let p = &t.players[0];
    let s = BytesN::from_array(&t.env, &salt(5));
    assert_eq!(t.client.commitment(&t.game, &p.pk(&t.env), &2, &3, &s), p.commitment(&t.env, &t.game, 2, 3, &salt(5)));
}

#[test]
fn create_checks_its_inputs() {
    let t = setup(2);
    let a = t.players[0].pk(&t.env);
    let dup = vec![&t.env, a.clone(), a.clone()];
    let fresh = BytesN::from_array(&t.env, &[1u8; 32]);
    assert_eq!(t.client.try_create(&fresh, &dup, &3, &60, &36).err().unwrap().unwrap(), Error::BadParams);
    let one = vec![&t.env, a.clone()];
    assert_eq!(t.client.try_create(&fresh, &one, &3, &60, &36).err().unwrap().unwrap(), Error::BadParams);
    let two = vec![&t.env, a.clone(), t.players[1].pk(&t.env)];
    assert_eq!(t.client.try_create(&fresh, &two, &0, &60, &36).err().unwrap().unwrap(), Error::BadParams);
    assert_eq!(t.client.try_create(&t.game, &two, &3, &60, &36).err().unwrap().unwrap(), Error::GameExists);
}
