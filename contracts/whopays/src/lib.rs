//! Who pays the bill? A one-round coin game judged by the contract.
//!
//! Everyone at the table hides some coins (0 to `max_coins`) in a fist and guesses the total.
//! Each move is sealed first (commit) and opened later (reveal), so nobody can wait for the
//! others before choosing:
//!   1. `create`: the table (the admin account that relays for Quits) lists the players by their
//!      Ed25519 public keys. Keys are generated in each phone's browser; no wallet is needed.
//!   2. `commit`: a player seals `SHA-256("QUITS/c" || game || player || coins || guess || salt)`.
//!      The commitment is signed by the player's key, so nobody can seal a move on their behalf,
//!      and anybody may relay it. Once every player has sealed, the reveal window opens.
//!   3. `reveal`: a player opens their move; the contract recomputes the hash. The last reveal
//!      settles the round. A player who does not reveal in time loses: that is what keeps the
//!      round honest once the others' moves are on the table.
//!   4. `settle`: after the reveal window, anyone can close a round with silent players.
//! The player furthest from the real total pays. Ties (and several silent players) are decided by
//! lot: the draw seed is the hash of every revealed salt, all of them fixed before anything was
//! revealed, so nobody can steer it.
//!
//! The contract never holds funds. It only decides who pays a bill the group already owes; the
//! payment itself goes wallet to wallet through Quits as usual.
#![no_std]
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, Bytes, BytesN, Env, Map, Vec,
};

/// Domain separation of the commitment hash.
pub const COMMIT_TAG: &[u8; 7] = b"QUITS/c";
/// Prefix of the message a player signs when sealing a move.
pub const SIGN_TAG: &[u8; 12] = b"QUITS/commit";
/// Domain separation of the draw seed.
pub const DRAW_TAG: &[u8; 10] = b"QUITS/draw";

const MAX_PLAYERS: u32 = 24;
const MAX_COINS: u32 = 9;
/// A round lives in temporary storage: about an hour (the minimum the network allows) is plenty
/// for a game that takes minutes, and it keeps the rent negligible. The transactions, with their
/// events, stay in the ledger history as the record of who paid.
const TTL_LEDGERS: u32 = 720;
const TTL_THRESHOLD: u32 = 360;

#[contracttype]
enum Key {
    Admin,
    Game(BytesN<32>),
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Phase {
    /// Players are sealing their moves.
    Commit = 0,
    /// Every active player has sealed; moves are being opened.
    Reveal = 1,
    /// Settled (see `settled`) or cancelled (fewer than two players sealed a move).
    Done = 2,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Reason {
    /// The loser did not open their move in time.
    NoReveal = 0,
    /// The loser's guess was the furthest from the real total.
    Furthest = 1,
}

/// A sealed move, as relayed to `commit_many`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Sealed {
    pub player: BytesN<32>,
    pub commitment: BytesN<32>,
    pub sig: BytesN<64>,
}

/// An opened move, as relayed to `reveal_many`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Opened {
    pub player: BytesN<32>,
    pub coins: u32,
    pub guess: u32,
    pub salt: BytesN<32>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Move {
    pub coins: u32,
    pub guess: u32,
    pub salt: BytesN<32>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Game {
    pub players: Vec<BytesN<32>>,
    pub max_coins: u32,
    pub created_at: u32,
    /// After this ledger anyone may `close` the sealing phase; before it only the admin may.
    pub commit_until: u32,
    /// Length of the reveal window, in ledgers.
    pub reveal_ledgers: u32,
    /// Last ledger in which a reveal is accepted (0 while sealing).
    pub reveal_until: u32,
    pub phase: Phase,
    /// Indexes of the players still in the round (those who had sealed when the phase closed).
    pub active: Vec<u32>,
    pub commits: Map<u32, BytesN<32>>,
    pub moves: Map<u32, Move>,
    /// Set once the round is settled (phase `Done`; a cancelled round stays unsettled).
    pub settled: bool,
    /// Index into `players` of who pays.
    pub loser: u32,
    /// Coins on the table, counting the moves that were opened.
    pub total: u32,
    pub reason: Reason,
    /// Whether a tie (or several silent players) was decided by lot.
    pub drawn: bool,
    /// Ledger in which the round was settled.
    pub settled_at: u32,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    NoSuchGame = 1,
    GameExists = 2,
    BadParams = 3,
    WrongPhase = 4,
    NotAPlayer = 5,
    AlreadySealed = 6,
    AlreadyOpened = 7,
    /// Reveal after the window, or a reveal that does not match the seal.
    TooLate = 8,
    BadReveal = 9,
    /// Coins above `max_coins`, or a guess above what the table could hold.
    BadMove = 10,
    /// Settling before the reveal window has passed.
    NotYet = 11,
}

#[contractevent(topics = ["created"])]
pub struct Created {
    #[topic]
    pub game: BytesN<32>,
    pub players: u32,
    pub max_coins: u32,
}

#[contractevent(topics = ["sealed"])]
pub struct SealedEv {
    #[topic]
    pub game: BytesN<32>,
    pub player: BytesN<32>,
}

#[contractevent(topics = ["opening"])]
pub struct Opening {
    #[topic]
    pub game: BytesN<32>,
    pub players: u32,
    pub reveal_until: u32,
}

#[contractevent(topics = ["opened"])]
pub struct OpenedEv {
    #[topic]
    pub game: BytesN<32>,
    pub player: BytesN<32>,
    pub coins: u32,
    pub guess: u32,
}

#[contractevent(topics = ["settled"])]
pub struct Settled {
    #[topic]
    pub game: BytesN<32>,
    pub loser: BytesN<32>,
    pub total: u32,
    pub reason: Reason,
    pub drawn: bool,
}

#[contractevent(topics = ["cancelled"])]
pub struct Cancelled {
    #[topic]
    pub game: BytesN<32>,
}

#[contract]
pub struct WhoPays;

#[contractimpl]
impl WhoPays {
    /// `admin` creates rounds and may close the sealing phase early. Everything else is open to anyone.
    pub fn __constructor(env: Env, admin: Address) {
        env.storage().instance().set(&Key::Admin, &admin);
    }

    pub fn admin(env: Env) -> Address {
        env.storage().instance().get(&Key::Admin).unwrap()
    }

    /// Opens a round. `commit_ledgers`: how long the sealing phase stays protected from a
    /// permissionless close. `reveal_ledgers`: the reveal window once everyone has sealed.
    pub fn create(
        env: Env,
        game: BytesN<32>,
        players: Vec<BytesN<32>>,
        max_coins: u32,
        commit_ledgers: u32,
        reveal_ledgers: u32,
    ) -> Result<(), Error> {
        Self::admin(env.clone()).require_auth();
        let key = Key::Game(game.clone());
        if env.storage().temporary().has(&key) {
            return Err(Error::GameExists);
        }
        let n = players.len();
        if n < 2 || n > MAX_PLAYERS || max_coins == 0 || max_coins > MAX_COINS || commit_ledgers == 0 || reveal_ledgers == 0 {
            return Err(Error::BadParams);
        }
        for i in 0..n {
            for j in (i + 1)..n {
                if players.get_unchecked(i) == players.get_unchecked(j) {
                    return Err(Error::BadParams);
                }
            }
        }
        let now = env.ledger().sequence();
        let mut active = Vec::new(&env);
        for i in 0..n {
            active.push_back(i);
        }
        let g = Game {
            players,
            max_coins,
            created_at: now,
            commit_until: now.saturating_add(commit_ledgers),
            reveal_ledgers,
            reveal_until: 0,
            phase: Phase::Commit,
            active,
            commits: Map::new(&env),
            moves: Map::new(&env),
            settled: false,
            loser: 0,
            total: 0,
            reason: Reason::Furthest,
            drawn: false,
            settled_at: 0,
        };
        save(&env, &game, &g);
        Created { game, players: n, max_coins }.publish(&env);
        Ok(())
    }

    /// Seals one move. `sig` is the player's Ed25519 signature of `"QUITS/commit" || game || commitment`;
    /// an invalid signature traps. Anyone may relay a sealed move.
    pub fn commit(env: Env, game: BytesN<32>, player: BytesN<32>, commitment: BytesN<32>, sig: BytesN<64>) -> Result<Game, Error> {
        let mut g = load(&env, &game)?;
        seal(&env, &game, &mut g, &player, &commitment, &sig)?;
        maybe_open(&env, &game, &mut g);
        save(&env, &game, &g);
        Ok(g)
    }

    /// Seals several moves in one transaction (all or nothing).
    pub fn commit_many(env: Env, game: BytesN<32>, sealed: Vec<Sealed>) -> Result<Game, Error> {
        let mut g = load(&env, &game)?;
        for s in sealed.iter() {
            seal(&env, &game, &mut g, &s.player, &s.commitment, &s.sig)?;
        }
        maybe_open(&env, &game, &mut g);
        save(&env, &game, &g);
        Ok(g)
    }

    /// Ends the sealing phase without waiting for everyone: players who have not sealed are
    /// dropped from the round. Anyone may call it after `commit_until`; before that, only the admin.
    /// With fewer than two sealed moves the round is cancelled.
    pub fn close(env: Env, game: BytesN<32>) -> Result<Game, Error> {
        let mut g = load(&env, &game)?;
        if g.phase != Phase::Commit {
            return Err(Error::WrongPhase);
        }
        if env.ledger().sequence() < g.commit_until {
            Self::admin(env.clone()).require_auth();
        }
        let mut keep = Vec::new(&env);
        for i in g.active.iter() {
            if g.commits.contains_key(i) {
                keep.push_back(i);
            }
        }
        g.active = keep;
        if g.active.len() < 2 {
            g.phase = Phase::Done;
            Cancelled { game: game.clone() }.publish(&env);
        } else {
            open(&env, &game, &mut g);
        }
        save(&env, &game, &g);
        Ok(g)
    }

    /// Opens one move. The last reveal settles the round.
    pub fn reveal(env: Env, game: BytesN<32>, player: BytesN<32>, coins: u32, guess: u32, salt: BytesN<32>) -> Result<Game, Error> {
        let mut g = load(&env, &game)?;
        unseal(&env, &game, &mut g, &player, coins, guess, &salt)?;
        maybe_settle(&env, &game, &mut g);
        save(&env, &game, &g);
        Ok(g)
    }

    /// Opens several moves in one transaction (all or nothing).
    pub fn reveal_many(env: Env, game: BytesN<32>, opened: Vec<Opened>) -> Result<Game, Error> {
        let mut g = load(&env, &game)?;
        for o in opened.iter() {
            unseal(&env, &game, &mut g, &o.player, o.coins, o.guess, &o.salt)?;
        }
        maybe_settle(&env, &game, &mut g);
        save(&env, &game, &g);
        Ok(g)
    }

    /// Settles a round once the reveal window has passed: whoever stayed silent loses.
    pub fn settle(env: Env, game: BytesN<32>) -> Result<Game, Error> {
        let mut g = load(&env, &game)?;
        if g.phase != Phase::Reveal {
            return Err(Error::WrongPhase);
        }
        if !all_opened(&g) && env.ledger().sequence() <= g.reveal_until {
            return Err(Error::NotYet);
        }
        resolve(&env, &game, &mut g);
        save(&env, &game, &g);
        Ok(g)
    }

    /// The round's state, until its hour in temporary storage runs out.
    pub fn game(env: Env, game: BytesN<32>) -> Option<Game> {
        env.storage().temporary().get(&Key::Game(game))
    }

    /// The commitment a browser must compute for a move (same bytes as the contract hashes).
    pub fn commitment(env: Env, game: BytesN<32>, player: BytesN<32>, coins: u32, guess: u32, salt: BytesN<32>) -> BytesN<32> {
        commitment_hash(&env, &game, &player, coins, guess, &salt)
    }
}

fn load(env: &Env, game: &BytesN<32>) -> Result<Game, Error> {
    env.storage().temporary().get(&Key::Game(game.clone())).ok_or(Error::NoSuchGame)
}

fn save(env: &Env, game: &BytesN<32>, g: &Game) {
    let key = Key::Game(game.clone());
    let store = env.storage().temporary();
    store.set(&key, g);
    store.extend_ttl(&key, TTL_THRESHOLD, TTL_LEDGERS);
}

fn index_of(g: &Game, player: &BytesN<32>) -> Result<u32, Error> {
    for i in 0..g.players.len() {
        if &g.players.get_unchecked(i) == player {
            return Ok(i);
        }
    }
    Err(Error::NotAPlayer)
}

fn seal(env: &Env, game: &BytesN<32>, g: &mut Game, player: &BytesN<32>, commitment: &BytesN<32>, sig: &BytesN<64>) -> Result<(), Error> {
    if g.phase != Phase::Commit {
        return Err(Error::WrongPhase);
    }
    let i = index_of(g, player)?;
    if g.commits.contains_key(i) {
        return Err(Error::AlreadySealed);
    }
    let mut msg = Bytes::from_array(env, SIGN_TAG);
    msg.extend_from_array(&game.to_array());
    msg.extend_from_array(&commitment.to_array());
    env.crypto().ed25519_verify(player, &msg, sig);
    g.commits.set(i, commitment.clone());
    SealedEv { game: game.clone(), player: player.clone() }.publish(env);
    Ok(())
}

fn all_sealed(g: &Game) -> bool {
    g.active.iter().all(|i| g.commits.contains_key(i))
}

fn all_opened(g: &Game) -> bool {
    g.active.iter().all(|i| g.moves.contains_key(i))
}

fn maybe_open(env: &Env, game: &BytesN<32>, g: &mut Game) {
    if g.phase == Phase::Commit && all_sealed(g) {
        open(env, game, g);
    }
}

fn open(env: &Env, game: &BytesN<32>, g: &mut Game) {
    g.phase = Phase::Reveal;
    g.reveal_until = env.ledger().sequence().saturating_add(g.reveal_ledgers);
    Opening { game: game.clone(), players: g.active.len(), reveal_until: g.reveal_until }.publish(env);
}

fn unseal(env: &Env, game: &BytesN<32>, g: &mut Game, player: &BytesN<32>, coins: u32, guess: u32, salt: &BytesN<32>) -> Result<(), Error> {
    if g.phase != Phase::Reveal {
        return Err(Error::WrongPhase);
    }
    if env.ledger().sequence() > g.reveal_until {
        return Err(Error::TooLate);
    }
    let i = index_of(g, player)?;
    if !g.active.contains(i) {
        return Err(Error::NotAPlayer);
    }
    if g.moves.contains_key(i) {
        return Err(Error::AlreadyOpened);
    }
    if coins > g.max_coins || guess > g.max_coins.saturating_mul(g.players.len()) {
        return Err(Error::BadMove);
    }
    if commitment_hash(env, game, player, coins, guess, salt) != g.commits.get_unchecked(i) {
        return Err(Error::BadReveal);
    }
    g.moves.set(i, Move { coins, guess, salt: salt.clone() });
    OpenedEv { game: game.clone(), player: player.clone(), coins, guess }.publish(env);
    Ok(())
}

fn maybe_settle(env: &Env, game: &BytesN<32>, g: &mut Game) {
    if g.phase == Phase::Reveal && all_opened(g) {
        resolve(env, game, g);
    }
}

/// Picks who pays. Silent players lose first; otherwise the furthest guess; ties by lot.
fn resolve(env: &Env, game: &BytesN<32>, g: &mut Game) {
    let mut total: u32 = 0;
    let mut silent: Vec<u32> = Vec::new(env);
    for i in g.active.iter() {
        match g.moves.get(i) {
            Some(m) => total += m.coins,
            None => silent.push_back(i),
        }
    }
    let (pool, reason) = if !silent.is_empty() {
        (silent, Reason::NoReveal)
    } else {
        let mut worst: u32 = 0;
        let mut pool: Vec<u32> = Vec::new(env);
        for i in g.active.iter() {
            let guess = g.moves.get_unchecked(i).guess;
            let d = if guess > total { guess - total } else { total - guess };
            if d > worst || pool.is_empty() {
                worst = d;
                pool = Vec::new(env);
                pool.push_back(i);
            } else if d == worst {
                pool.push_back(i);
            }
        }
        (pool, Reason::Furthest)
    };
    let drawn = pool.len() > 1;
    let loser = if drawn { pool.get_unchecked(draw(env, game, g) % pool.len()) } else { pool.get_unchecked(0) };
    g.settled = true;
    g.loser = loser;
    g.total = total;
    g.reason = reason;
    g.drawn = drawn;
    g.settled_at = env.ledger().sequence();
    g.phase = Phase::Done;
    Settled { game: game.clone(), loser: g.players.get_unchecked(loser), total, reason, drawn }.publish(env);
}

/// Draw seed: the hash of every revealed salt, in player order. All of them were fixed before
/// any move was opened, so no player can steer the draw.
fn draw(env: &Env, game: &BytesN<32>, g: &Game) -> u32 {
    let mut buf = Bytes::from_array(env, DRAW_TAG);
    buf.extend_from_array(&game.to_array());
    for i in g.active.iter() {
        if let Some(m) = g.moves.get(i) {
            buf.extend_from_array(&m.salt.to_array());
        }
    }
    let h: BytesN<32> = env.crypto().sha256(&buf).into();
    let b = h.to_array();
    u32::from_be_bytes([b[0], b[1], b[2], b[3]])
}

/// SHA-256("QUITS/c" || game || player || coins as one byte || guess as one byte || salt).
fn commitment_hash(env: &Env, game: &BytesN<32>, player: &BytesN<32>, coins: u32, guess: u32, salt: &BytesN<32>) -> BytesN<32> {
    let mut buf = Bytes::from_array(env, COMMIT_TAG);
    buf.extend_from_array(&game.to_array());
    buf.extend_from_array(&player.to_array());
    buf.extend_from_array(&[(coins & 0xff) as u8, (guess & 0xff) as u8]);
    buf.extend_from_array(&salt.to_array());
    env.crypto().sha256(&buf).into()
}

#[cfg(test)]
mod test;
