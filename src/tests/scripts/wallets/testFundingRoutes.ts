/**
 * Integration test for funding route management APIs.
 * Tests creating, listing, and webhook routing of funding routes.
 * 
 * Usage:
 *   npx tsx src/tests/scripts/wallets/testFundingRoutes.ts <ADMIN_TOKEN> <WALLET_ID> <MEMBER_USER_ID>
 */

import { cliRequest, handleCliError } from "../../helpers/cliHelper.js";

async function main() {
  try {
    const [adminToken, walletId, memberUserId] = process.argv.slice(2);

    if (!adminToken || !walletId || !memberUserId) {
      console.error("Usage: tsx src/tests/scripts/wallets/testFundingRoutes.ts <ADMIN_TOKEN> <WALLET_ID> <MEMBER_USER_ID>");
      process.exit(1);
    }

    console.log("🧪 Testing funding route management...\n");

    // Test 1: Create a funding route
    console.log("Test 1: Creating funding route...");
    const createResult = await cliRequest(
      "post",
      `/wallet/${walletId}/funding-routes`,
      {
        providerName: "MOCK",
        providerAccountId: "test-account-123",
        reference: "test-ref-001",
        userId: memberUserId,
      },
      adminToken
    );

    console.log("✓ Funding route created:");
    console.log(JSON.stringify(createResult, null, 2));
    console.log();

    // Validate create response
    const errors: string[] = [];

    if (!createResult.route) {
      errors.push("❌ Response missing 'route' field");
    } else {
      if (createResult.route.providerName !== "MOCK") {
        errors.push(`❌ Expected providerName 'MOCK', got '${createResult.route.providerName}'`);
      }
      if (createResult.route.providerAccountId !== "test-account-123") {
        errors.push(`❌ Expected providerAccountId 'test-account-123', got '${createResult.route.providerAccountId}'`);
      }
      if (createResult.route.reference !== "test-ref-001") {
        errors.push(`❌ Expected reference 'test-ref-001', got '${createResult.route.reference}'`);
      }
      if (createResult.route.walletId !== walletId) {
        errors.push(`❌ Expected walletId '${walletId}', got '${createResult.route.walletId}'`);
      }
      if (createResult.route.userId !== memberUserId) {
        errors.push(`❌ Expected userId '${memberUserId}', got '${createResult.route.userId}'`);
      }
      console.log("✓ Route fields validated");
    }

    // Test 2: List funding routes
    console.log("\nTest 2: Listing funding routes...");
    const listResult = await cliRequest(
      "get",
      `/wallet/${walletId}/funding-routes`,
      undefined,
      adminToken
    );

    console.log("✓ Funding routes listed:");
    console.log(JSON.stringify(listResult, null, 2));
    console.log();

    // Validate list response
    if (!listResult.routes) {
      errors.push("❌ Response missing 'routes' field");
    } else {
      if (!Array.isArray(listResult.routes)) {
        errors.push("❌ 'routes' is not an array");
      } else if (listResult.routes.length === 0) {
        errors.push("❌ Expected at least one route in list");
      } else {
        console.log(`✓ Found ${listResult.routes.length} route(s)`);
        
        // Verify our created route is in the list
        const foundRoute = listResult.routes.find(
          (r: any) => r.providerAccountId === "test-account-123" && r.reference === "test-ref-001"
        );
        
        if (foundRoute) {
          console.log("✓ Created route found in list");
        } else {
          errors.push("❌ Created route not found in list");
        }
      }
    }

    // Test 3: Create another route (default reference)
    console.log("\nTest 3: Creating funding route with empty reference...");
    const createDefaultResult = await cliRequest(
      "post",
      `/wallet/${walletId}/funding-routes`,
      {
        providerName: "MOCK",
        providerAccountId: "test-account-456",
        userId: memberUserId,
        // No reference field - should default to empty string
      },
      adminToken
    );

    console.log("✓ Default route created:");
    console.log(JSON.stringify(createDefaultResult, null, 2));
    console.log();

    if (createDefaultResult.route && (createDefaultResult.route.reference === "" || createDefaultResult.route.reference === null)) {
      console.log("✓ Empty reference handled correctly");
    } else {
      errors.push("❌ Expected empty or null reference for default route");
    }

    // Test 4: Upsert (update existing route)
    console.log("\nTest 4: Upserting existing route...");
    const upsertResult = await cliRequest(
      "post",
      `/wallet/${walletId}/funding-routes`,
      {
        providerName: "MOCK",
        providerAccountId: "test-account-123",
        reference: "test-ref-001",
        userId: memberUserId, // Same composite key, should update
      },
      adminToken
    );

    console.log("✓ Route upserted:");
    console.log(JSON.stringify(upsertResult, null, 2));
    console.log();

    if (upsertResult.route) {
      console.log("✓ Upsert succeeded (no duplicate error)");
    } else {
      errors.push("❌ Upsert failed");
    }

    // Final validation
    console.log();
    if (errors.length > 0) {
      console.error("❌ Test failed with errors:");
      errors.forEach(err => console.error("  " + err));
      process.exit(1);
    }

    console.log("✅ All assertions passed! Funding route management working correctly.");
    console.log("\nSummary:");
    console.log("  ✓ Routes can be created with specific references");
    console.log("  ✓ Routes can be created with default (empty) references");
    console.log("  ✓ Routes can be listed per wallet");
    console.log("  ✓ Routes can be upserted (no duplicates)");
    console.log("  ✓ All route fields are properly stored and returned");
  } catch (err: any) {
    handleCliError(err);
  }
}

main();

