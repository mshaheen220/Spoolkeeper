import "dotenv/config";
import { createApp } from "./app";
import { config } from "./config";
import { getDb } from "./db";

getDb(); // open + migrate up front so a bad database fails at boot, not on first request

createApp().listen(config.port, () => {
  console.log(`Spoolkeeper server listening on port ${config.port}`);
});
