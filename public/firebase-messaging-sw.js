importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

// Initialize the Firebase app in the service worker by passing in the
// messagingSenderId.
const firebaseConfig = {
  apiKey: "AIzaSyCwiT0N9yYTme8xxoyS6XlVQncNsEXqjFU",
  authDomain: "retrack-b3275.firebaseapp.com",
  projectId: "retrack-b3275",
  storageBucket: "retrack-b3275.firebasestorage.app",
  messagingSenderId: "778757546027",
  appId: "1:778757546027:web:9a50c25d714723dde1ca6e",
  measurementId: "G-VCKJ382QM7",
};

firebase.initializeApp(firebaseConfig);

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
