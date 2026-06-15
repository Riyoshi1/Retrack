import "dotenv/config";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

async function clearTokens() {
  const serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountStr) { console.error("No FIREBASE_SERVICE_ACCOUNT"); return; }

  const sanitized = serviceAccountStr.replace(/[\x00-\x1F\x7F]/g, (ch) => {
    if (ch === '\n') return '\\n';
    if (ch === '\r') return '\\r';
    if (ch === '\t') return '\\t';
    return '';
  });

  const certConfig = JSON.parse(sanitized);
  if (certConfig.private_key) {
    certConfig.private_key = certConfig.private_key.replace(/\\n/g, '\n');
  }

  initializeApp({ credential: cert(certConfig) });
  const db = getFirestore();

  console.log("Fetching all users from Firestore...");
  const usersSnap = await db.collection("users").get();

  if (usersSnap.empty) {
    console.log("No users found in Firestore.");
    return;
  }

  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data();
    console.log(`User ${userDoc.id} - tokens:`, data.tokens);
    
    // Clear all stored tokens so they get re-registered fresh
    await userDoc.ref.update({ tokens: [] });
    console.log(`✅ Cleared tokens for user ${userDoc.id}`);
  }

  console.log("\nDone! All old FCM tokens cleared.");
  console.log("Now go to the app and toggle Push Notification OFF then ON again to register a fresh token.");
  process.exit(0);
}

clearTokens().catch(console.error);
