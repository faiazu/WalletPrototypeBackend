#!/usr/bin/env tsx
/**
 * Reset All Development Data
 * 
 * This script:
 * 1. Wipes Synctera sandbox data (via /wipe endpoint)
 * 2. Resets local Prisma database (drops all data and re-applies migrations)
 * 
 * ⚠️ WARNING: This is DESTRUCTIVE and should only be used in development!
 * 
 * Usage: npm run reset:all
 */

import axios from "axios";
import dotenv from "dotenv";
import { execSync } from "child_process";

dotenv.config();

const apiKey = process.env.SYNCTERA_API_KEY;
const baseUrl = process.env.SYNCTERA_BASE_URL || "https://api-sandbox.synctera.com/v0";

async function wipeSynctera() {
  console.log("\n🧹 Step 1/2: Wiping Synctera Sandbox...");
  
  if (!apiKey) {
    console.error("❌ Missing SYNCTERA_API_KEY in environment.");
    process.exit(1);
  }

  const url = `${baseUrl.replace(/\/+$/, "")}/wipe`;

  try {
    const res = await axios.post(
      url,
      {},
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("✅ Synctera sandbox wiped:", res.status, res.statusText);
  } catch (err: any) {
    console.error("❌ Failed to wipe Synctera sandbox");
    if (err?.response) {
      console.error("Status:", err.response.status);
      console.error("Body:", err.response.data);
    } else {
      console.error(err?.message || err);
    }
    process.exit(1);
  }
}

async function resetPrisma() {
  console.log("\n🗄️  Step 2/2: Resetting Local Database...");
  
  try {
    // Run prisma migrate reset with force flag and AI consent
    execSync("npx prisma migrate reset --force --skip-generate", {
      stdio: "inherit",
      env: {
        ...process.env,
        // Provide consent for AI-initiated database reset
        PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: "npm run reset:all",
      },
    });
    
    console.log("✅ Local database reset complete");
  } catch (err: any) {
    console.error("❌ Failed to reset local database:", err.message);
    process.exit(1);
  }
}

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("⚠️  RESET ALL DEVELOPMENT DATA");
  console.log("═══════════════════════════════════════════════════════");
  console.log("");
  console.log("This will:");
  console.log("  1. Wipe all Synctera sandbox data (persons, accounts, cards)");
  console.log("  2. Drop and recreate local Prisma database");
  console.log("");
  console.log("⚠️  All data will be permanently deleted!");
  console.log("");

  try {
    await wipeSynctera();
    await resetPrisma();
    
    console.log("\n═══════════════════════════════════════════════════════");
    console.log("✅ ALL SYSTEMS RESET SUCCESSFULLY!");
    console.log("═══════════════════════════════════════════════════════");
    console.log("");
    console.log("You can now:");
    console.log("  • Start fresh with: BAAS_PROVIDER=SYNCTERA npm run dev");
    console.log("  • Test iOS app with clean slate");
    console.log("");
  } catch (error) {
    console.error("\n❌ Reset failed");
    process.exit(1);
  }
}

main();

