import { config } from "dotenv";
import path from "node:path";

// Tests run against whatever Postgres instance .env points at. Each test
// creates uniquely-named organizations and cleans up after itself (see
// tests/helpers.ts) — safe to point at your dev DB, but don't point it at a
// database whose data you can't afford to have tests read/write alongside.
config({ path: path.resolve(__dirname, "../.env") });
