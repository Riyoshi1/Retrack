import "dotenv/config";
import { initializeApp, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

async function testAdmin() {
  try {
    console.log("Loading service account...");
    const serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT;
    
    if (!serviceAccountStr) {
      console.log("FIREBASE_SERVICE_ACCOUNT is empty in .env");
      return;
    }

    const sanitized = serviceAccountStr.replace(/[\x00-\x1F\x7F]/g, (ch) => {
      if (ch === '\n') return '\\n';
      if (ch === '\r') return '\\r';
      if (ch === '\t') return '\\t';
      return '';
    });
    
    const certConfig = JSON.parse(sanitized);
    
    if (certConfig.private_key) {
      certConfig.private_key = certConfig.private_key.replace(/\\n/g, '\n').replace(/\n+/g, '\n');
    }

    console.log("Service Account parsed. Project ID:", certConfig.project_id);
    console.log("Private Key length:", certConfig.private_key?.length);
    console.log("Private Key starts with:", certConfig.private_key?.substring(0, 30));
    console.log("Private Key ends with:", certConfig.private_key?.substring(certConfig.private_key.length - 30));

    const app = initializeApp({
      credential: cert(certConfig),
    });

    console.log("App initialized. Attempting to send a dummy message to a fake token to test auth...");
    
    try {
      await getMessaging(app).send({
        token: "fake-token-just-to-test-auth-123456",
        notification: { title: "Test" }
      });
    } catch (msgErr: any) {
      console.log("Messaging Error:", msgErr.code, msgErr.message);
      if (msgErr.code === 'messaging/invalid-argument' || msgErr.code === 'messaging/registration-token-not-registered') {
        console.log("✅ SUCCESS! The authentication worked! The error is just about the fake token, which is expected.");
      } else {
        console.log("❌ AUTH FAILED:", msgErr.message);
      }
    }
  } catch (err: any) {
    console.error("Initialization failed:", err.message);
  }
}

testAdmin();
