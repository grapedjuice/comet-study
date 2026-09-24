import { pgTable, text } from "drizzle-orm/pg-core";

// A deliberately narrow marker for opt-in fictional demo data.
export const demoSeedMarkers = pgTable("demo_seed_markers", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
});
