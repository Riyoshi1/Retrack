importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

// Service Worker for Firebase Cloud Messaging (FCM).
// Firebase config is injected dynamically via postMessage from the main thread.
// This prevents hardcoding API keys in source files committed to version control.

let messagingInitialized = false;

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "FIREBASE_CONFIG" && !messagingInitialized) {
    try {
      firebase.initializeApp(event.data.config);
      messagingInitialized = true;

      const messaging = firebase.messaging();

      // Background message handler
      messaging.onBackgroundMessage((payload) => {
        console.log(
          "[firebase-messaging-sw.js] Received background message ",
          payload
        );

        const notificationTitle = payload.notification?.title || "Notification";
        const notificationOptions = {
          body: payload.notification?.body || "You have a new message.",
          icon: "/favicon.ico",
        };

        self.registration.showNotification(notificationTitle, notificationOptions);
      });

      console.log("[firebase-messaging-sw.js] Firebase initialized via postMessage.");
    } catch (err) {
      console.error("[firebase-messaging-sw.js] Failed to initialize Firebase:", err);
    }
  }
});
