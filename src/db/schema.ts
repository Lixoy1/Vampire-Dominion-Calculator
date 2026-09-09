import { relations } from "drizzle-orm";
import {
  pgEnum,
  pgTable,
  text,
  integer,
  boolean,
  uuid,
  timestamp,
  date,
  index,
} from "drizzle-orm/pg-core";

export const heroClassEnum = pgEnum("hero_class", [
  "blood_warrior",
  "shadow_mage",
  "night_assassin",
  "necromancer",
  "crimson_priest",
]);

export const artifactSlotEnum = pgEnum("artifact_slot", [
  "weapon",
  "armor",
  "amulet",
  "ring",
  "rune",
]);

export const rarityEnum = pgEnum("rarity", [
  "common",
  "rare",
  "epic",
  "legendary",
  "mythic",
]);

export const resourceEnum = pgEnum("resource", [
  "blood",
  "souls",
  "gold",
  "essence",
  "shards",
]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    token: text("token").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const heroes = pgTable(
  "heroes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    heroClass: heroClassEnum("hero_class").notNull(),
    level: integer("level").notNull().default(1),
    stars: integer("stars").notNull().default(1),
    attack: integer("attack").notNull().default(100),
    hp: integer("hp").notNull().default(1000),
    defense: integer("defense").notNull().default(80),
    speed: integer("speed").notNull().default(90),
    favorite: boolean("favorite").notNull().default(false),
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("heroes_user_idx").on(t.userId)],
);

export const artifacts = pgTable(
  "artifacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    heroId: uuid("hero_id").references(() => heroes.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    slot: artifactSlotEnum("slot").notNull(),
    rarity: rarityEnum("rarity").notNull().default("rare"),
    attackBonus: integer("attack_bonus").notNull().default(0),
    hpBonus: integer("hp_bonus").notNull().default(0),
    defenseBonus: integer("defense_bonus").notNull().default(0),
    speedBonus: integer("speed_bonus").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("artifacts_user_idx").on(t.userId)],
);

export const goals = pgTable(
  "goals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    note: text("note").notNull().default(""),
    resource: resourceEnum("resource").notNull().default("blood"),
    targetAmount: integer("target_amount").notNull(),
    currentAmount: integer("current_amount").notNull().default(0),
    deadline: date("deadline"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("goals_user_idx").on(t.userId)],
);

export const usersRelations = relations(users, ({ many }) => ({
  heroes: many(heroes),
  artifacts: many(artifacts),
  goals: many(goals),
  sessions: many(sessions),
}));

export const heroesRelations = relations(heroes, ({ one, many }) => ({
  user: one(users, { fields: [heroes.userId], references: [users.id] }),
  artifacts: many(artifacts),
}));

export const artifactsRelations = relations(artifacts, ({ one }) => ({
  user: one(users, { fields: [artifacts.userId], references: [users.id] }),
  hero: one(heroes, { fields: [artifacts.heroId], references: [heroes.id] }),
}));

export const goalsRelations = relations(goals, ({ one }) => ({
  user: one(users, { fields: [goals.userId], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Hero = typeof heroes.$inferSelect;
export type Artifact = typeof artifacts.$inferSelect;
export type Goal = typeof goals.$inferSelect;
