import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { getFirestore, collection, doc, setDoc, deleteDoc, getDocs, query, where } from "firebase/firestore";

// Client-side Firebase Configuration (Provided by User)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);

export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Google Sign-In Error:", error);
    throw error;
  }
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Logout Error:", error);
  }
};

// VAPID Key dari Firebase Console > Project Settings > Cloud Messaging > Web Push certificates
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

export const requestNotificationPermissionAndGetToken = async (): Promise<string | null> => {
  try {
    const messaging = getMessaging(app);
    // Request permission from the browser
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      console.log("Notification permission granted. Requesting FCM token with VAPID key...");

      // Service worker registration for FCM
      let swRegistration: ServiceWorkerRegistration | undefined;
      try {
        swRegistration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
        console.log("Service Worker registered successfully:", swRegistration);
      } catch (swErr) {
        console.error("Service Worker registration failed:", swErr);
      }

      const currentToken = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: swRegistration,
      });

      if (currentToken) {
        console.log("FCM Token retrieved successfully:", currentToken);
        return currentToken;
      } else {
        console.warn("No registration token available. Pastikan VAPID key sudah benar dan service worker terdaftar.");
        return null;
      }
    } else {
      console.warn("Notification permission not granted. Status:", permission);
      return null;
    }
  } catch (err: any) {
    console.error("Error saat mengambil FCM token:", err);
    console.error("Detail error:", err?.code, err?.message);
    if (err?.code === "messaging/token-subscribe-failed") {
      console.error("Kemungkinan penyebab: VAPID key salah, atau Firebase project belum mengaktifkan Cloud Messaging API.");
    }
    return null;
  }
};

// Setup persistent foreground message listener
// Firebase does NOT auto-show notifications when app is in foreground,
// so we must manually display them using the browser Notification API.
export const setupForegroundNotificationListener = (
  onPayload?: (payload: any) => void
) => {
  const messaging = getMessaging(app);
  onMessage(messaging, (payload) => {
    console.log("Received foreground message ", payload);

    // Show a native browser notification popup
    const title = payload.notification?.title || "Retrack Notification";
    const body = payload.notification?.body || "You have a new message.";
    
    if (Notification.permission === "granted") {
      new Notification(title, {
        body,
        icon: "/favicon.ico",
      });
    }

    // Also forward to any callback (e.g. for in-app toast)
    if (onPayload) {
      onPayload(payload);
    }
  });
};

// Legacy wrapper (kept for backward compatibility)
export const onMessageListener = () =>
  new Promise((resolve) => {
    const messaging = getMessaging(app);
    onMessage(messaging, (payload) => {
      console.log("Received foreground message ", payload);
      resolve(payload);
    });
  });

// ============================================
// FIRESTORE DATABASE CRUD FUNCTIONS
// ============================================

export const saveActivityToDb = async (userId: string, activity: any) => {
  try {
    const activityRef = doc(db, "activities", activity.id);
    await setDoc(activityRef, {
      ...activity,
      userId,
    });
    console.log("Activity saved successfully to DB");
  } catch (error) {
    console.error("Error saving activity to DB:", error);
    throw error;
  }
};

export const deleteActivityFromDb = async (activityId: string) => {
  try {
    const activityRef = doc(db, "activities", activityId);
    await deleteDoc(activityRef);
    console.log("Activity deleted successfully from DB");
  } catch (error) {
    console.error("Error deleting activity from DB:", error);
    throw error;
  }
};

export const updateActivityInDb = async (activityId: string, updatedData: any) => {
  try {
    const activityRef = doc(db, "activities", activityId);
    await setDoc(activityRef, updatedData, { merge: true });
    console.log("Activity updated successfully in DB");
  } catch (error) {
    console.error("Error updating activity in DB:", error);
    throw error;
  }
};

export const fetchUserActivities = async (userId: string) => {
  try {
    const q = query(collection(db, "activities"), where("userId", "==", userId));
    const querySnapshot = await getDocs(q);
    const userActivities: any[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      // Exclude userId from the returned activity object
      const { userId, ...activityData } = data;
      userActivities.push(activityData);
    });
    return userActivities;
  } catch (error) {
    console.error("Error fetching user activities:", error);
    throw error;
  }
};
