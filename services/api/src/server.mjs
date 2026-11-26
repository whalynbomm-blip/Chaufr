import { createAppServer, developmentFareConfig } from "./http.mjs";
import { connectDatabase } from "./database.mjs";

const port = Number(process.env.PORT ?? 3000);
const fareConfig = developmentFareConfig();
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

let database = null;
if (process.env.DATABASE_URL) {
  database = await connectDatabase();
  const pricing = await database.query("SELECT config FROM platform_pricing_settings WHERE singleton = true");
  if (pricing.rowCount) Object.assign(fareConfig, pricing.rows[0].config);
  console.log("Chaufr database connected and migrations are current");
}

const server = createAppServer({ database, fareConfig });
const scheduleWorker = setInterval(() => {
  server.mobilityService?.processDueScheduledRides().catch((error) => {
    console.error("Scheduled ride worker failed", error.message);
  });
}, 60_000);
scheduleWorker.unref?.();

server.listen(port, "0.0.0.0", () => {
  console.log(`Chaufr API listening on port ${port}`);
});

const shutdown = async () => {
  server.close(async () => {
    if (database) await database.end();
    process.exit(0);
  });
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
