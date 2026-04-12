import { pgTable, serial, integer, boolean, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pageProgressTable = pgTable("page_progress", {
  id: serial("id").primaryKey(),
  pageNumber: integer("page_number").notNull().unique(),
  inScope: boolean("in_scope").notNull().default(false),
  quality: text("quality"),
  mistakes: integer("mistakes"),
  lastRecited: timestamp("last_recited", { withTimezone: true }),
  dueDate: timestamp("due_date", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPageProgressSchema = createInsertSchema(pageProgressTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPageProgress = z.infer<typeof insertPageProgressSchema>;
export type PageProgress = typeof pageProgressTable.$inferSelect;
