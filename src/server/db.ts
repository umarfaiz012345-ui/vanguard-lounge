import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'vanguard.db');
export const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      phone TEXT,
      password_hash TEXT,
      oauth_provider TEXT,
      role TEXT NOT NULL DEFAULT 'customer',
      tier TEXT NOT NULL DEFAULT 'Bronze',
      points INTEGER NOT NULL DEFAULT 250,
      referral_code TEXT NOT NULL UNIQUE,
      referred_by TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      status_tag TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL,
      play_url TEXT NOT NULL,
      download_url TEXT NOT NULL,
      image_path TEXT NOT NULL,
      active_players INTEGER NOT NULL DEFAULT 0,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS service_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      sla_minutes INTEGER NOT NULL DEFAULT 15,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS promotions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      bonus_label TEXT NOT NULL,
      code TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      game_id TEXT,
      subject TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      assigned_staff_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sender_role TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      body TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      game_link_payload TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'system',
      is_read INTEGER NOT NULL DEFAULT 0,
      link_tab TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payment_methods (
      id TEXT PRIMARY KEY,
      method_type TEXT NOT NULL,
      label TEXT NOT NULL,
      instructions TEXT NOT NULL,
      account_or_address TEXT NOT NULL,
      network_or_routing TEXT NOT NULL,
      external_url TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      updated_by TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payment_submissions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      method_id TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      receipt_url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      player_notes TEXT,
      admin_notes TEXT,
      reviewed_by TEXT,
      reviewed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (method_id) REFERENCES payment_methods(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS enquiries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      category TEXT NOT NULL,
      subject TEXT NOT NULL,
      details TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      staff_notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS compliance_settings (
      id TEXT PRIMARY KEY,
      legal_authorized INTEGER NOT NULL DEFAULT 0,
      jurisdiction_notice TEXT NOT NULL,
      compliance_banner TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_payment_submissions_user ON payment_submissions(user_id);
    CREATE INDEX IF NOT EXISTS idx_payment_submissions_status ON payment_submissions(status);
  `);

  // Non-destructive schema migrations for existing databases
  try {
    const userColumns = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
    if (!userColumns.some((col) => col.name === 'phone')) {
      db.exec("ALTER TABLE users ADD COLUMN phone TEXT;");
    }
    if (!userColumns.some((col) => col.name === 'email_verified')) {
      db.exec("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;");
      db.exec("UPDATE users SET email_verified = 1 WHERE role = 'admin';");
    }
  } catch (err) {
    console.error('Migration notice for users columns:', err);
  }

  try {
    const messageColumns = db.prepare("PRAGMA table_info(messages)").all() as Array<{ name: string }>;
    if (!messageColumns.some((col) => col.name === 'is_read')) {
      db.exec("ALTER TABLE messages ADD COLUMN is_read INTEGER NOT NULL DEFAULT 0;");
    }
    if (!messageColumns.some((col) => col.name === 'attachment_url')) {
      db.exec("ALTER TABLE messages ADD COLUMN attachment_url TEXT;");
    }
  } catch (err) {
    console.error('Migration notice for messages columns:', err);
  }

  try {
    const pmColumns = db.prepare("PRAGMA table_info(payment_methods)").all() as Array<{ name: string }>;
    if (!pmColumns.some((col) => col.name === 'external_url')) {
      db.exec("ALTER TABLE payment_methods ADD COLUMN external_url TEXT;");
    }
  } catch (err) {
    console.error('Migration notice for payment_methods.external_url:', err);
  }

  seedInitialData();
}

function seedInitialData(): void {
  const now = new Date().toISOString();

  const gameCount = (db.prepare('SELECT COUNT(*) as count FROM games').get() as { count: number }).count;
  if (gameCount === 0) {
    const games = [
      {
        id: 'game_juwa',
        slug: 'juwa',
        name: 'Juwa',
        category: 'Sweepstakes Slots',
        status_tag: 'Hot',
        description: 'Signature multi-reel sweepstakes lounge featuring deep-sea reels and classic 777 tables.',
        play_url: 'https://dl.juwa777.com/',
        download_url: 'https://dl.juwa777.com/',
        image_path: '/src/assets/images/game_juwa_1795217163023.jpg',
        active_players: 418,
        is_enabled: 1,
        sort_order: 1,
      },
      {
        id: 'game_juwa_2',
        slug: 'juwa-2-0',
        name: 'Juwa 2.0',
        category: 'Sweepstakes Slots',
        status_tag: 'New',
        description: 'Next-generation Juwa engine with upgraded sapphire jackpot lobbies and faster mobile rendering.',
        play_url: 'https://m.juwa777.com/',
        download_url: 'https://m.juwa777.com/',
        image_path: '/src/assets/images/game_juwa_two_1795217163024.jpg',
        active_players: 362,
        is_enabled: 1,
        sort_order: 2,
      },
      {
        id: 'game_fire_kirin',
        slug: 'fire-kirin',
        name: 'Fire Kirin',
        category: 'Fish Arcade',
        status_tag: 'Hot',
        description: 'High-tempo multiplayer fish arcade arena with gilded dragon boss encounters and precision turrets.',
        play_url: 'https://firekirin.xyz:8580/',
        download_url: 'https://firekirin.xyz:8580/',
        image_path: '/src/assets/images/game_fire_kirin_1795217163218.jpg',
        active_players: 529,
        is_enabled: 1,
        sort_order: 3,
      },
      {
        id: 'game_orion_stars',
        slug: 'orion-stars',
        name: 'Orion Stars',
        category: 'Cosmic Jackpot',
        status_tag: 'Live',
        description: 'Celestial sweepstakes suite combining astral reel chambers with progressive starlight multipliers.',
        play_url: 'https://start.orionstars.vip:8580/',
        download_url: 'https://start.orionstars.vip:8580/',
        image_path: '/src/assets/images/game_orion_stars_1795217163552.jpg',
        active_players: 484,
        is_enabled: 1,
        sort_order: 4,
      },
      {
        id: 'game_milky_way',
        slug: 'milky-way',
        name: 'Milky Way',
        category: 'Cosmic Jackpot',
        status_tag: 'Hot',
        description: 'Deep-space arcade floor hosting classic planetary reels, nebulae bonus rounds, and swift lobbies.',
        play_url: 'https://milkywayapp.xyz:8580/',
        download_url: 'https://milkywayapp.xyz:8580/',
        image_path: '/src/assets/images/game_milky_way_1795217162898.jpg',
        active_players: 391,
        is_enabled: 1,
        sort_order: 5,
      },
      {
        id: 'game_panda_master',
        slug: 'panda-master',
        name: 'Panda Master',
        category: 'Sweepstakes Slots',
        status_tag: 'Live',
        description: 'Martial-arts themed sweepstakes catalog with high-contrast cabinet reels and dual-screen play.',
        play_url: 'https://pandamaster.vip:8888/',
        download_url: 'https://pandamaster.vip:8888/',
        image_path: '/src/assets/images/game_panda_master_1795217163227.jpg',
        active_players: 295,
        is_enabled: 1,
        sort_order: 6,
      },
      {
        id: 'game_dragon_fury',
        slug: 'dragon-fury',
        name: 'Dragon Fury',
        category: 'Fish Arcade',
        status_tag: 'New',
        description: 'Imperial dragon fish-table and reel hybrid engineered for low-latency touch and desktop play.',
        play_url: 'https://dragonfury.club/',
        download_url: 'https://dragonfury.club/',
        image_path: '/src/assets/images/game_dragon_fury_1795217163088.jpg',
        active_players: 214,
        is_enabled: 1,
        sort_order: 7,
      },
      {
        id: 'game_ding_ding',
        slug: 'ding-ding',
        name: 'Ding Ding',
        category: 'Table & Vault',
        status_tag: 'Live',
        description: 'Classic brass bell sweepstakes wheel and rapid-spin arcade lounge with curated daily rooms.',
        play_url: 'https://dingdingding.com/',
        download_url: 'https://dingdingding.com/',
        image_path: '/src/assets/images/game_ding_ding_1795217163445.jpg',
        active_players: 187,
        is_enabled: 1,
        sort_order: 8,
      },
      {
        id: 'game_vault',
        slug: 'game-vault',
        name: 'Game Vault',
        category: 'Table & Vault',
        status_tag: 'Hot',
        description: 'Vault-grade multi-platform gaming suite featuring keno, reels, and armored VIP rooms.',
        play_url: 'https://download.gamevault999.com/',
        download_url: 'https://download.gamevault999.com/',
        image_path: '/src/assets/images/game_game_vault_1795217163192.jpg',
        active_players: 446,
        is_enabled: 1,
        sort_order: 9,
      },
      {
        id: 'game_gameroom',
        slug: 'gameroom',
        name: 'Gameroom',
        category: 'Table & Vault',
        status_tag: 'Live',
        description: 'Private parlor table games, gilded card rooms, and precision arcade cabinets under one client.',
        play_url: 'https://www.gameroom777.com/',
        download_url: 'https://www.gameroom777.com/',
        image_path: '/src/assets/images/game_gameroom_1795217163697.jpg',
        active_players: 263,
        is_enabled: 1,
        sort_order: 10,
      },
      {
        id: 'game_ultra_panda',
        slug: 'ultra-panda',
        name: 'Ultra Panda',
        category: 'Sweepstakes Slots',
        status_tag: 'New',
        description: 'Crown-edition sweepstakes lounge offering smooth cross-device cabinet sync and exclusive rooms.',
        play_url: 'https://www.ultrapanda.mobi/',
        download_url: 'https://www.ultrapanda.mobi/',
        image_path: '/src/assets/images/game_ultra_panda_1795217163433.jpg',
        active_players: 338,
        is_enabled: 1,
        sort_order: 11,
      },
    ];

    const insertGame = db.prepare(`
      INSERT INTO games (id, slug, name, category, status_tag, description, play_url, download_url, image_path, active_players, is_enabled, sort_order)
      VALUES (@id, @slug, @name, @category, @status_tag, @description, @play_url, @download_url, @image_path, @active_players, @is_enabled, @sort_order)
    `);
    const insertMany = db.transaction((items: typeof games) => {
      for (const item of items) insertGame.run(item);
    });
    insertMany(games);
  }

  const catCount = (db.prepare('SELECT COUNT(*) as count FROM service_categories').get() as { count: number }).count;
  if (catCount === 0) {
    const insertCat = db.prepare(`
      INSERT INTO service_categories (id, name, description, sla_minutes, is_active, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertCat.run('cat_onboarding', 'Game Access & Client Links', 'Request external platform credentials, iOS/Android/Web download links, and setup guidance.', 5, 1, 1);
    insertCat.run('cat_technical', 'Client & Connectivity Support', 'Troubleshoot game client installation, browser compatibility, or session disconnects.', 15, 1, 2);
    insertCat.run('cat_tiers', 'Player Tiers & Loyalty Points', 'Questions regarding Bronze through Diamond progression, referral tracking, and non-monetary perks.', 30, 1, 3);
    insertCat.run('cat_compliance', 'Compliance & Legal Verification', 'Review jurisdiction eligibility, age verification policy, and external payment compliance status.', 60, 1, 4);
  }

  const promoCount = (db.prepare('SELECT COUNT(*) as count FROM promotions').get() as { count: number }).count;
  if (promoCount === 0) {
    const insertPromo = db.prepare(`
      INSERT INTO promotions (id, title, summary, bonus_label, code, is_active, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertPromo.run('promo_welcome', 'VIP Concierge Onboarding', 'Receive priority game-client setup and 500 Loyalty Tier Points upon completing profile onboarding.', '+500 Tier Pts', 'VANGUARD500', 1, '2026-12-31');
    insertPromo.run('promo_juwa2', 'Juwa 2.0 Launch Spotlight', 'Explore the refreshed Juwa 2.0 client via Support Chat for instant link delivery and lobby walkthrough.', 'Featured Client', 'JUWA2VIP', 1, '2026-12-15');
    insertPromo.run('promo_referral', 'Ambassador Referral Milestone', 'Earn 200 Loyalty Points for every verified player who joins with your personal referral code.', '+200 Pts / Invite', 'INVITEVIP', 1, '2026-12-31');
  }

  const payCount = (db.prepare('SELECT COUNT(*) as count FROM payment_methods').get() as { count: number }).count;
  if (payCount === 0) {
    const insertPay = db.prepare(`
      INSERT INTO payment_methods (id, method_type, label, instructions, account_or_address, network_or_routing, external_url, is_active, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertPay.run(
      'pm_cashapp',
      'cash_app',
      'Cash App',
      'Send payment to the official $cashtag below. Include your registered player email in the payment note. Take a screenshot of the completed transfer receipt and submit it below.',
      '$vanguardvip',
      'Cashtag: $vanguardvip',
      'https://cash.app/$vanguardvip',
      1,
      'system',
      now
    );
    insertPay.run(
      'pm_venmo',
      'venmo',
      'Venmo',
      'Send via Venmo to @vanguardlounge. Toggle off Purchase Protection to ensure exact credit settlement. Submit your transaction confirmation screenshot below.',
      '@vanguardlounge',
      'Handle: @vanguardlounge',
      'https://venmo.com/vanguardlounge',
      1,
      'system',
      now
    );
    insertPay.run(
      'pm_zelle',
      'zelle',
      'Zelle Express',
      'Send direct transfer via Zelle to pay@vanguardlounge.com. Instant verification once screenshot receipt is submitted.',
      'pay@vanguardlounge.com',
      'Enrolled: Vanguard VIP Services',
      null,
      1,
      'system',
      now
    );
    insertPay.run(
      'pm_crypto_btc',
      'cryptocurrency',
      'Bitcoin (BTC) & USDT',
      'Transfer BTC or USDT directly to the VIP vault treasury. Minimum 1 network confirmation required. Upload your transaction confirmation screenshot.',
      'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
      'Bitcoin Native SegWit / USDT TRC-20',
      null,
      1,
      'system',
      now
    );
  }

  const complianceCount = (db.prepare('SELECT COUNT(*) as count FROM compliance_settings').get() as { count: number }).count;
  if (complianceCount === 0) {
    db.prepare(`
      INSERT INTO compliance_settings (id, legal_authorized, jurisdiction_notice, compliance_banner, updated_at)
      VALUES ('singleton', 0, ?, ?, ?)
    `).run(
      'Financial deposits, cashouts, and wallet funding remain disabled until business legal authorization and regional sweepstakes compliance requirements are verified.',
      'Compliance Gate Active: Financial & account funding actions are currently disabled. Browse games, request external client links via Support Chat, and track loyalty tiers.',
      now
    );
  }
}

export function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

export function generateReferralCode(name: string): string {
  const clean = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4) || 'VIP';
  const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${clean}-${suffix}`;
}
