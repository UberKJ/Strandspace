// DiabeticSpace SQLite migrations.
// This is intentionally lightweight (no external migration framework).

function ensureMigrationTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS diabetic_schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      migration_key TEXT UNIQUE NOT NULL,
      applied_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

function hasMigration(db, key) {
  const row = db.prepare("SELECT 1 as ok FROM diabetic_schema_migrations WHERE migration_key = ?").get(String(key));
  return Boolean(row?.ok);
}

function markMigration(db, key) {
  db.prepare("INSERT OR IGNORE INTO diabetic_schema_migrations (migration_key) VALUES (?)").run(String(key));
}

function tableColumns(db, tableName) {
  return db.prepare(`PRAGMA table_info('${String(tableName).replace(/'/g, "''")}')`).all().map((row) => String(row.name ?? ""));
}

function ensureRecipeColumns(db, additions = []) {
  const columns = new Set(tableColumns(db, "diabetic_recipes"));
  for (const addition of additions) {
    if (!columns.has(addition.name)) {
      db.exec(`ALTER TABLE diabetic_recipes ADD COLUMN ${addition.sql};`);
      columns.add(addition.name);
    }
  }
}

export function runDiabeticMigrations(db) {
  ensureMigrationTable(db);

  const apply = (migration_key, fn) => {
    if (hasMigration(db, migration_key)) return;
    fn();
    markMigration(db, migration_key);
  };

  apply("001_base_recipes_and_builder", () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS diabetic_recipes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipe_id TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        meal_type TEXT,
        description TEXT,
        ingredients TEXT,
        substitutes TEXT,
        instructions TEXT,
        servings INTEGER,
        serving_notes TEXT,
        tags TEXT,
        gi_notes TEXT,
        trigger_words TEXT,
        image_url TEXT,
        source TEXT,
        recall_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_diabetic_recipes_meal_type ON diabetic_recipes(meal_type);
      CREATE INDEX IF NOT EXISTS idx_diabetic_recipes_recall_count ON diabetic_recipes(recall_count DESC);
      CREATE TABLE IF NOT EXISTS diabetic_builder_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT UNIQUE NOT NULL,
        stage TEXT NOT NULL,
        meal_type TEXT,
        goal TEXT,
        include_items TEXT,
        avoid_items TEXT,
        servings INTEGER,
        extra_notes TEXT,
        original_query TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_diabetic_builder_sessions_updated ON diabetic_builder_sessions(updated_at DESC);
    `);

    ensureRecipeColumns(db, [
      { name: "image_url", sql: "image_url TEXT" }
    ]);
  });

  apply("002_recipe_ratings", () => {
    ensureRecipeColumns(db, [
      { name: "rating", sql: "rating INTEGER DEFAULT 0" },
      { name: "favorite", sql: "favorite INTEGER DEFAULT 0" },
      { name: "last_cooked_at", sql: "last_cooked_at TEXT" },
      { name: "updated_at", sql: "updated_at TEXT DEFAULT (datetime('now'))" }
    ]);
    db.exec("CREATE INDEX IF NOT EXISTS idx_diabetic_recipes_favorite ON diabetic_recipes(favorite);");
    db.exec("CREATE INDEX IF NOT EXISTS idx_diabetic_recipes_rating ON diabetic_recipes(rating DESC);");
    db.exec("CREATE INDEX IF NOT EXISTS idx_diabetic_recipes_updated ON diabetic_recipes(updated_at DESC);");
  });

  apply("003_meal_plans", () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS diabetic_meal_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_id TEXT UNIQUE NOT NULL,
        week_start TEXT NOT NULL,
        title TEXT,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_diabetic_meal_plans_week_start ON diabetic_meal_plans(week_start);

      CREATE TABLE IF NOT EXISTS diabetic_meal_plan_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_id TEXT NOT NULL,
        recipe_id TEXT,
        day_of_week TEXT NOT NULL,
        meal_slot TEXT NOT NULL,
        servings INTEGER,
        notes TEXT,
        position INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_diabetic_meal_plan_items_plan ON diabetic_meal_plan_items(plan_id);
    `);
  });

  apply("004_shopping_lists", () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS diabetic_shopping_lists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        list_id TEXT UNIQUE NOT NULL,
        source_type TEXT,
        source_id TEXT,
        title TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_diabetic_shopping_lists_updated ON diabetic_shopping_lists(updated_at DESC);

      CREATE TABLE IF NOT EXISTS diabetic_shopping_list_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        list_id TEXT NOT NULL,
        name TEXT NOT NULL,
        amount TEXT,
        unit TEXT,
        category TEXT,
        checked INTEGER DEFAULT 0,
        recipe_id TEXT,
        notes TEXT,
        position INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_diabetic_shopping_list_items_list ON diabetic_shopping_list_items(list_id);
    `);
  });

  apply("005_user_settings", () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS diabetic_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        pin_hash TEXT,
        role TEXT DEFAULT 'owner',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS diabetic_user_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT,
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(user_id, key)
      );
      CREATE INDEX IF NOT EXISTS idx_diabetic_user_settings_user ON diabetic_user_settings(user_id);
    `);
  });

  apply("006_recipe_sharing_metadata", () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS diabetic_recipe_sharing (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipe_id TEXT NOT NULL,
        share_id TEXT UNIQUE NOT NULL,
        visibility TEXT DEFAULT 'private',
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_diabetic_recipe_sharing_recipe ON diabetic_recipe_sharing(recipe_id);
    `);
  });

  apply("007_llm_provider_settings", () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS diabetic_llm_provider_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT,
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(provider_id, key)
      );
      CREATE INDEX IF NOT EXISTS idx_diabetic_llm_provider_settings_provider ON diabetic_llm_provider_settings(provider_id);
    `);
  });

  apply("008_recipe_sharing_columns", () => {
    ensureRecipeColumns(db, [
      { name: "public_share_id", sql: "public_share_id TEXT" },
      { name: "share_status", sql: "share_status TEXT DEFAULT 'private'" },
      { name: "license_note", sql: "license_note TEXT" },
      { name: "author_name", sql: "author_name TEXT" }
    ]);

    db.exec("UPDATE diabetic_recipes SET share_status = 'private' WHERE share_status IS NULL OR trim(share_status) = '';");
    db.exec("CREATE INDEX IF NOT EXISTS idx_diabetic_recipes_share_status ON diabetic_recipes(share_status);");
    db.exec("CREATE INDEX IF NOT EXISTS idx_diabetic_recipes_public_share_id ON diabetic_recipes(public_share_id);");
  });
}
