import { pgTable, serial, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  excellentDays: integer("excellent_days").notNull().default(30),
  goodDays: integer("good_days").notNull().default(14),
  hardDays: integer("hard_days").notNull().default(7),
  relearnDays: integer("relearn_days").notNull().default(3),
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({ id: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;
