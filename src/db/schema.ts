import { pgTable, uuid, text, varchar, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).unique().notNull(),
    name: varchar("name", { length: 255 }),
    passwordHash: text("password_hash"),
    createdAt: timestamp("created_at").defaultNow(),
});

export const sessions = pgTable("sessions", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id),
    title: varchar("title", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
});

export const files = pgTable("files", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id),
    sessionId: uuid("session_id").references(() => sessions.id),
    filename: varchar("filename", { length: 255 }).notNull(),
    fileType: varchar("file_type", { length: 50 }).notNull(),
    filePath: varchar("file_path", { length: 500 }).notNull(),
    fileSize: integer("file_size"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow(),
});

export const messages = pgTable("messages", {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").references(() => sessions.id),
    role: varchar("role", { length: 20 }).notNull(), // 'user' or 'assistant'
    content: text("content").notNull(),
    code: text("code"),
    result: jsonb("result"),
    visualizationUrl: text("visualization_url"),
    createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
    sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
    user: one(users, { fields: [sessions.userId], references: [users.id] }),
    messages: many(messages),
    files: many(files),
}));

export const filesRelations = relations(files, ({ one }) => ({
    session: one(sessions, { fields: [files.sessionId], references: [sessions.id] }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
    session: one(sessions, { fields: [messages.sessionId], references: [sessions.id] }),
}));
