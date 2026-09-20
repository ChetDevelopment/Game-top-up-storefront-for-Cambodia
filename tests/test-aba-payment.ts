/**
 * ABA Payment Integration Test Script
 * 
 * Run: npx tsx tests/test-aba-payment.ts
 */

import { initiateABAPayment, checkABAPayment } from "../lib/aba-payway";
import { InitiatePaymentArgs } from "../lib/payment-types";

console.log("🧪 ABA Payment Integration Test\n");

// Test 1: Check configuration
console.log("1️⃣ Checking ABA configuration...");
const hasMerchantId = !!process.env.ABA_MERCHANT_ID;
const hasSecretKey = !!process.env.ABA_SECRET_KEY;
const hasPublicKey = !!process.env.ABA_PUBLIC_KEY;

console.log(`   ABA_MERCHANT_ID: ${hasMerchantId ? "✅ SET" : "❌ MISSING"}`);
console.log(`   ABA_SECRET_KEY: ${hasSecretKey ? "✅ SET" : "❌ MISSING"}`);
console.log(`   ABA_PUBLIC_KEY: ${hasPublicKey ? "✅ SET" : "❌ MISSING"}`);

if (!hasMerchantId || !hasSecretKey) {
  console.log("\n❌ ABA credentials not configured!");
  console.log("   Add these to your .env.local file:");
  console.log("   ABA_MERCHANT_ID=your_merchant_id");
  console.log("   ABA_SECRET_KEY=your_secret_key");
  console.log("   ABA_PUBLIC_KEY=your_public_key\n");
  process.exit(1);
}

console.log("   ✅ Configuration OK\n");

// Test 2: Initiate payment (simulation)
async function testInitiatePayment() {
  console.log("2️⃣ Testing payment initiation...");
  
  const testArgs: InitiatePaymentArgs = {
    orderNumber: `TEST${Date.now()}`,
    amountUsd: 1.00,
    amountKhr: 4100,
    currency: "USD",
    method: "ABA",
    returnUrl: "http://localhost:3000/checkout/test",
    cancelUrl: "http://localhost:3000/games/test",
    callbackUrl: "http://localhost:3000/api/payment/webhook/aba",
    customerEmail: "test@example.com",
    customerPhone: "+85512345678",
  };

  try {
    const result = await initiateABAPayment(testArgs);
    console.log("   ✅ Payment initiated successfully");
    console.log(`   Payment Ref: ${result.paymentRef}`);
    console.log(`   Has QR: ${!!result.qrString}`);
    console.log(`   Has URL: ${!!result.redirectUrl}`);
    console.log(`   Expires: ${result.expiresAt.toISOString()}`);
    console.log("");
    return result;
  } catch (error: any) {
    console.log(`   ❌ Payment initiation failed: ${error.message}`);
    console.log("");
    throw error;
  }
}

// Test 3: Check payment status
async function testCheckPayment(paymentRef: string) {
  console.log("3️⃣ Testing payment status check...");
  
  try {
    const result = await checkABAPayment(paymentRef);
    console.log("   ✅ Status check completed");
    console.log(`   Status: ${result.status}`);
    console.log(`   Paid: ${result.paid}`);
    console.log(`   Message: ${result.message || "N/A"}`);
    console.log("");
    return result;
  } catch (error: any) {
    console.log(`   ⚠️ Status check returned: ${error.message}`);
    console.log("");
    return error;
  }
}

// Test 4: Verify webhook signature
function testWebhookSignature() {
  console.log("4️⃣ Testing webhook signature verification...");
  
  const { verifyABAWebhookSignature } = require("../lib/aba-payway");
  const crypto = require("crypto");
  
  const testPayload = JSON.stringify({
    reference_id: "TEST123",
    status: "success",
    amount: "1.00"
  });
  
  if (!process.env.ABA_SECRET_KEY) {
    console.log("   ⚠️ Skipping - no secret key\n");
    return;
  }
  
  // Generate test signature
  const testSignature = crypto
    .createHmac("sha256", process.env.ABA_SECRET_KEY)
    .update(testPayload)
    .digest("hex")
    .toUpperCase();
  
  // Verify signature
  const isValid = verifyABAWebhookSignature(testPayload, testSignature);
  
  console.log(`   Generated signature: ${testSignature.slice(0, 32)}...`);
  console.log(`   Verification result: ${isValid ? "✅ VALID" : "❌ INVALID"}`);
  console.log("");
}

// Run all tests
async function runTests() {
  try {
    await testInitiatePayment();
    // Skip status check for now (requires real payment)
    // await testCheckPayment(result.paymentRef);
    testWebhookSignature();
    
    console.log("✅ All tests completed!\n");
    console.log("📋 Next steps:");
    console.log("   1. Configure ABA credentials in .env.local");
    console.log("   2. Set up webhook URL in ABA dashboard");
    console.log("   3. Test with real payment flow in browser");
    console.log("");
  } catch (error) {
    console.log("❌ Tests failed");
    console.log(error);
    process.exit(1);
  }
}

runTests();
