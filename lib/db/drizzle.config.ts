import { defineConfig } from "drizzle-kit";
import path from "path";

const connectionString = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("SUPABASE_DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  out: path.join(__dirname, "./migrations"),
  dialect: "postgresql",
  // This app's tables live in the "cabinet" schema of a Supabase database
  // shared with an unrelated app (see schema/enums.ts). Restricting
  // introspection to "cabinet" keeps drizzle-kit from ever diffing/altering
  // the other app's tables in "public" or other schemas.
  schemaFilter: ["cabinet"],
  dbCredentials: {
    url: connectionString,
  },
});
