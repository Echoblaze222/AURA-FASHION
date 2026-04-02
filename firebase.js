// ============================================================
//  AURA FASHION — firebase.js
//  Stage 1: Core Infrastructure & Auth
//
//  HOW TO USE THIS FILE:
//  Add this at the top of your HTML file:
//  <script type="module" src="firebase.js"></script>
//
//  This file handles:
//   1. Connecting to Firebase (your backend database)
//   2. Signing users in with Google
//   3. Creating new accounts with email + password
//   4. Sending email verification links
//   5. Saving user data to Firestore (the database)
//   6. Checking if admin is logging in for the first time
// ============================================================


// ── STEP 1: IMPORT FIREBASE TOOLS ───────────────────────────
// Firebase is split into small pieces called "modules".
// We only import the exact tools we need — this keeps the
// app fast by not loading things we don't use.

// "initializeApp" — the master switch that turns Firebase on
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";

// Auth tools — everything related to logging users in/out
import {
  getAuth,                        // Gets the Auth service so we can use it
  GoogleAuthProvider,             // The Google login "connector"
  signInWithPopup,                // Opens a popup window for Google login
  createUserWithEmailAndPassword, // Creates a brand new account with email + pw
  signInWithEmailAndPassword,     // Logs in an existing email account
  sendEmailVerification,          // Sends a "verify your email" link to the user
  onAuthStateChanged,             // Watches for login/logout events in real time
  signOut                         // Logs the current user out
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// Firestore tools — everything related to reading/writing the database
import {
  getFirestore,   // Gets the Firestore database service
  doc,            // Points to a specific document (like a row in a table)
  setDoc,         // Writes data INTO a document (creates or overwrites)
  getDoc,         // READS data FROM a single document
  serverTimestamp // Asks Firebase to write the current time automatically
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Storage tools — for uploading images/files
import {
  getStorage // Gets the Storage service (we'll use this more in Stage 2)
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";


// ── STEP 2: YOUR FIREBASE PROJECT CONFIG ────────────────────
// This object is like your app's ID card.
// Firebase uses this to know WHICH project to connect to.
// ⚠️  Never share these keys publicly in a real production app —
//     use environment variables or Firebase App Check instead.
const firebaseConfig = {
  apiKey:            "AIzaSyDwGOFdiJngS6Zwtqp35vT4NDbkpkqm0NE",
  authDomain:        "aura-fashion-45631.firebaseapp.com",   // The login domain
  projectId:         "aura-fashion-45631",                   // Your project's unique name
  storageBucket:     "aura-fashion-45631.firebasestorage.app", // Where uploaded files live
  messagingSenderId: "285868852460",                         // For push notifications (future)
  appId:             "1:285868852460:web:cbf40f1b92c782ab2b51c9", // This app's unique ID
  measurementId:     "G-H5D3HEW607"                         // For Google Analytics
};


// ── STEP 3: TURN FIREBASE ON ─────────────────────────────────
// initializeApp() reads the config above and starts the connection.
// Think of it like plugging in a device — nothing works until this runs.
const app = initializeApp(firebaseConfig);

// Now get each individual service we need.
// These are like different departments of Firebase:
const auth    = getAuth(app);      // 🔐 The "Security Department" (handles logins)
const db      = getFirestore(app); // 🗄️  The "Records Department" (stores all data)
const storage = getStorage(app);   // 📦 The "Warehouse" (stores images/files)


// ── STEP 4: YOUR ADMIN CONFIG ────────────────────────────────
// This is the one email address that gets admin powers.
// When someone logs in with THIS email, we check if it's their
// first time — and if so, send them to the profile setup page.
//
// 🔧 TO CUSTOMIZE: Change this to your real admin email.
const ADMIN_EMAIL = "admin@aura.com";

// Where to send users after they log in successfully
const DASHBOARD_URL    = "index.html";      // Regular users go here
const SETUP_PROFILE_URL = "update-profile.html"; // First-time admin goes here


// ============================================================
//  FUNCTION 1: signInWithGoogle()
//
//  What it does:
//   - Opens a Google popup window
//   - The user picks their Google account
//   - Firebase gets their name, email, and profile picture
//   - We save their info to Firestore (the database)
//   - Then we redirect them to the dashboard
//
//  How to call it (from your HTML button):
//   <button onclick="signInWithGoogle()">Sign in with Google</button>
// ============================================================
async function signInWithGoogle() {
  try {
    // Create a new "Google connector" object
    // This tells Firebase we want to use Google as the login method
    const provider = new GoogleAuthProvider();

    // Ask Firebase to show the Google login popup window.
    // "await" means: pause here and wait for the user to finish
    // choosing their Google account before moving to the next line.
    // "result" will contain everything Firebase got back from Google.
    const result = await signInWithPopup(auth, provider);

    // result.user is the logged-in user object from Firebase.
    // It contains: uid (unique ID), email, displayName, photoURL, etc.
    const user = result.user;

    // Save this user's data to Firestore.
    // We call our helper function below — see FUNCTION 3 for details.
    await saveUserToFirestore(user, "google");

    // Check if this is the admin logging in for the first time.
    // This function decides where to redirect them.
    await handlePostLoginRedirect(user);

  } catch (error) {
    // If anything goes wrong (user closes popup, no internet, etc.)
    // we catch the error here so the app doesn't crash.
    console.error("Google Sign-In failed:", error.code, error.message);

    // Show a friendly message to the user
    showAuthError(error.code);
  }
}


// ============================================================
//  FUNCTION 2: registerWithEmail(email, password)
//
//  What it does:
//   - Creates a brand new Firebase account with email + password
//   - Sends a verification email so the user confirms they own it
//   - Saves the user's data to Firestore
//   - Shows a message telling them to check their inbox
//
//  How to call it (from your signup form):
//   registerWithEmail("user@gmail.com", "mypassword123");
//
//  Parameters:
//   email    — the user's email address (string)
//   password — the user's chosen password (string, min 6 characters)
//   name     — the user's display name (string, optional)
// ============================================================
async function registerWithEmail(email, password, name = "") {
  try {
    // createUserWithEmailAndPassword does two things at once:
    //  1. Creates a new account in Firebase Auth
    //  2. Automatically signs the user into that new account
    // "await" pauses here until Firebase confirms the account was created.
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);

    // userCredential.user is the newly created user object.
    // It has: uid (unique ID), email, emailVerified (false right now), etc.
    const user = userCredential.user;

    // ── Send the verification email ──────────────────────────
    // sendEmailVerification() sends a link to the user's email.
    // When they click that link, Firebase marks their account as verified.
    // Until they verify, emailVerified will be false.
    //
    // The email contains a special link like:
    // "Click here to verify your AURA account → [link]"
    await sendEmailVerification(user);
    console.log("Verification email sent to:", user.email);

    // ── Save the user's data to Firestore ────────────────────
    // We store extra info about the user that Firebase Auth doesn't hold,
    // like their display name and when they signed up.
    await saveUserToFirestore(user, "email", name);

    // Tell the UI that signup worked and to check email
    // (We return an object so the calling code can show the right message)
    return {
      success: true,
      message: `Account created! Check ${email} for a verification link.`,
      user: user
    };

  } catch (error) {
    console.error("Email registration failed:", error.code, error.message);

    // Return the error so the form can show it to the user
    return {
      success: false,
      message: getFriendlyErrorMessage(error.code),
      error: error
    };
  }
}


// ============================================================
//  FUNCTION 3: signInWithEmail(email, password)
//
//  What it does:
//   - Logs in an existing user with their email and password
//   - After login, checks if this is the admin's first login
//   - Redirects them to the right page
//
//  How to call it:
//   signInWithEmail("user@gmail.com", "password123");
// ============================================================
async function signInWithEmail(email, password) {
  try {
    // signInWithEmailAndPassword checks the email + password against
    // Firebase Auth. If they match, it logs the user in.
    const userCredential = await signInWithEmailAndPassword(auth, email, password);

    // Get the user object from the result
    const user = userCredential.user;

    // Check where to send them (dashboard vs profile setup)
    await handlePostLoginRedirect(user);

    return { success: true, user };

  } catch (error) {
    console.error("Email Sign-In failed:", error.code, error.message);
    return {
      success: false,
      message: getFriendlyErrorMessage(error.code)
    };
  }
}


// ============================================================
//  FUNCTION 4: saveUserToFirestore(user, method, name)
//
//  What it does:
//   - Takes the user object from Firebase Auth
//   - Creates (or updates) a document for them in Firestore
//   - Stores their name, email, sign-up method, and timestamps
//
//  Think of Firestore like a spreadsheet in the cloud:
//   Collection = the sheet tab (we use "users")
//   Document   = one row on that sheet (identified by user.uid)
//   Fields     = the columns (name, email, createdAt, etc.)
//
//  Parameters:
//   user   — the Firebase user object (from Auth)
//   method — how they signed up: "google" or "email"
//   name   — their display name (optional, used for email signup)
// ============================================================
async function saveUserToFirestore(user, method, name = "") {
  // doc(db, "users", user.uid) creates a POINTER to a specific location:
  //   db         = our Firestore database
  //   "users"    = the collection (like a folder)
  //   user.uid   = the document ID (like the file name — unique per user)
  //
  // Example path: /users/abc123xyz
  const userDocRef = doc(db, "users", user.uid);

  // Check if this user already has a document in Firestore.
  // getDoc() fetches the document from the database.
  // "await" pauses until the database responds.
  const existingDoc = await getDoc(userDocRef);

  // existingDoc.exists() returns true if the document was found,
  // false if this user has never been saved before.
  if (existingDoc.exists()) {
    // ── Existing user: just update their last login time ────
    // setDoc with { merge: true } means:
    //   "Only update the fields I specify — don't touch the rest."
    //   Without merge:true it would DELETE all existing fields first!
    await setDoc(userDocRef, {
      lastLoginAt: serverTimestamp(), // Firebase writes the exact current time
      lastLoginMethod: method         // "google" or "email"
    }, { merge: true }); // merge:true = update only, don't overwrite everything

    console.log("Updated existing user:", user.uid);

  } else {
    // ── New user: create their full profile document ─────────
    // This is the first time we've seen this user, so we create
    // a complete record for them in the "users" collection.
    await setDoc(userDocRef, {
      // Basic identity info from Firebase Auth
      uid:          user.uid,           // Their unique Firebase ID (never changes)
      email:        user.email,         // Their email address
      displayName:  name || user.displayName || user.email.split("@")[0], // Best available name
      photoURL:     user.photoURL || "",   // Profile picture (Google provides this)

      // How did they sign up?
      signUpMethod: method,             // "google" or "email"

      // Account status flags
      emailVerified: user.emailVerified, // true for Google users, false for email signups until they click the link
      isAdmin:       user.email === ADMIN_EMAIL, // true if this is the admin email

      // First-login flag — THIS IS THE KEY FOR ADMIN REDIRECT
      // When the admin logs in for the first time, this will be true.
      // After they set up their profile, we set it to false.
      // We only set this on NEW documents, so it's always true on first save.
      firstLogin:    true,

      // Timestamps — serverTimestamp() asks Firebase to record the exact time
      // This is better than using JavaScript's Date() because all users
      // get the server's time, not their own device's time (which could be wrong).
      createdAt:     serverTimestamp(), // When the account was first created
      lastLoginAt:   serverTimestamp(), // We'll update this every login

      // Extra profile fields (empty for now, filled in update-profile.html)
      phone:         "",
      storeName:     "",
      storeLocation: ""
    });

    console.log("Created new user document for:", user.uid);
  }
}


// ============================================================
//  FUNCTION 5: handlePostLoginRedirect(user)
//
//  What it does:
//   - Called after EVERY successful login (Google or email)
//   - Checks: is this the admin email?
//   - If yes: checks the firstLogin flag in Firestore
//   - If firstLogin is true → send them to update-profile.html
//   - If firstLogin is false → send them to dashboard (index.html)
//   - If not admin → send them to dashboard
//
//  This is the "traffic controller" after login.
// ============================================================
async function handlePostLoginRedirect(user) {
  // ── Check 1: Is this the admin email? ────────────────────
  // We compare the logged-in user's email to our ADMIN_EMAIL constant.
  // === means "exactly equal" (case-sensitive, so "Admin@aura.com" ≠ "admin@aura.com")
  if (user.email === ADMIN_EMAIL) {

    // ── This IS the admin — check if it's their first login ──
    // We need to look up their document in Firestore to read the firstLogin flag.
    // doc() creates a pointer to: /users/{admin's uid}
    const adminDocRef = doc(db, "users", user.uid);

    // getDoc() actually fetches the data from the database (network request).
    // "await" pauses here until Firestore responds with the document.
    const adminDoc = await getDoc(adminDocRef);

    if (adminDoc.exists()) {
      // Read the data out of the document
      // .data() returns all the fields as a JavaScript object
      const adminData = adminDoc.data();

      // adminData.firstLogin is the flag we set in saveUserToFirestore().
      // If it's true, this admin has never set up their profile yet.
      if (adminData.firstLogin === true) {

        console.log("Admin first login detected — redirecting to profile setup.");

        // Redirect to the profile update page.
        // window.location.href changes the browser's URL, navigating away.
        window.location.href = SETUP_PROFILE_URL;
        return; // Stop this function here — don't run anything below
      }
    }

    // If we get here, admin exists and firstLogin is false.
    // They've already set up their profile, so send them to the dashboard.
    console.log("Admin returning login — redirecting to dashboard.");
    window.location.href = DASHBOARD_URL;

  } else {
    // ── This is a regular customer (not admin) ───────────────
    // Regular users always go straight to the dashboard.
    console.log("Customer login — redirecting to dashboard.");
    window.location.href = DASHBOARD_URL;
  }
}


// ============================================================
//  FUNCTION 6: completeAdminProfileSetup(profileData)
//
//  What it does:
//   - Called from update-profile.html when admin submits their
//     new email, name, password, etc.
//   - Updates their Firestore document
//   - Sets firstLogin = false so they don't get redirected again
//   - Then redirects them to the dashboard
//
//  Call this from update-profile.html after the form is submitted.
// ============================================================
async function completeAdminProfileSetup(profileData) {
  // auth.currentUser is the currently logged-in user.
  // If nobody is logged in, this will be null.
  const user = auth.currentUser;

  if (!user) {
    // This shouldn't happen normally, but handle it just in case
    console.error("No user is logged in — cannot complete profile setup.");
    window.location.href = "login.html"; // Send them back to login
    return;
  }

  try {
    // Point to this user's document in Firestore
    // Path: /users/{user's uid}
    const userDocRef = doc(db, "users", user.uid);

    // Update the document with the new profile info.
    // merge: true means we only update the fields listed below —
    // all other fields (createdAt, email, etc.) stay the same.
    await setDoc(userDocRef, {
      displayName:   profileData.name     || user.displayName || "",
      phone:         profileData.phone    || "",
      storeName:     profileData.storeName || "AURA Store",
      storeLocation: profileData.location  || "",

      // THE KEY UPDATE: Set firstLogin to false.
      // Next time the admin logs in, handlePostLoginRedirect()
      // will see this is false and send them to the dashboard instead.
      firstLogin: false,

      // Record when the profile was completed
      profileCompletedAt: serverTimestamp()
    }, { merge: true }); // merge: true = don't erase other fields!

    console.log("Admin profile setup complete — redirecting to dashboard.");

    // Now that setup is done, go to the dashboard
    window.location.href = DASHBOARD_URL;

  } catch (error) {
    console.error("Profile setup failed:", error);
    return { success: false, message: error.message };
  }
}


// ============================================================
//  FUNCTION 7: onAuthStateChanged LISTENER
//
//  What it does:
//   - This is a "watcher" that runs automatically whenever
//     the login state changes (user logs in, logs out, or
//     the page loads and Firebase remembers the last session).
//
//  Think of it like a security guard who constantly checks:
//   "Is someone logged in? Who is it?"
//
//  You don't call this function — Firebase calls it for you.
// ============================================================
onAuthStateChanged(auth, async (user) => {
  if (user) {
    // ── Someone IS logged in ──────────────────────────────────
    // "user" contains their uid, email, emailVerified, etc.
    console.log("Auth state: User is logged in →", user.email);

    // Make the current user available globally so other scripts
    // on the page can access it (e.g., to show their name in the nav).
    window.currentUser = user;

    // Dispatch a custom event so other parts of the app can react.
    // Any script can listen for this: window.addEventListener("userReady", ...)
    window.dispatchEvent(new CustomEvent("userReady", { detail: user }));

  } else {
    // ── Nobody is logged in ───────────────────────────────────
    console.log("Auth state: No user logged in.");
    window.currentUser = null;

    // Dispatch event so the UI can update (e.g., hide profile icon)
    window.dispatchEvent(new CustomEvent("userSignedOut"));
  }
});


// ============================================================
//  FUNCTION 8: logOut()
//
//  What it does:
//   - Signs the current user out of Firebase Auth
//   - Firebase also clears the session from the browser
//   - Redirect to login page
//
//  How to call it:
//   <button onclick="logOut()">Sign Out</button>
// ============================================================
async function logOut() {
  try {
    // signOut(auth) tells Firebase to end this user's session.
    // Firebase also automatically clears the saved session from
    // the browser's storage (IndexedDB/localStorage).
    await signOut(auth);
    console.log("User signed out successfully.");

    // Send them back to the home/login page
    window.location.href = "index.html";

  } catch (error) {
    console.error("Sign out failed:", error);
  }
}


// ============================================================
//  HELPER: getFriendlyErrorMessage(errorCode)
//
//  Firebase Auth gives us error codes like "auth/email-already-in-use".
//  These are technical — we translate them into plain English
//  so the user understands what went wrong.
// ============================================================
function getFriendlyErrorMessage(errorCode) {
  // A lookup table: Firebase error code → human-readable message
  const messages = {
    "auth/email-already-in-use":   "This email is already registered. Try signing in instead.",
    "auth/invalid-email":          "That doesn't look like a valid email address.",
    "auth/weak-password":          "Password is too weak — use at least 6 characters.",
    "auth/user-not-found":         "No account found with that email.",
    "auth/wrong-password":         "Incorrect password. Please try again.",
    "auth/too-many-requests":      "Too many failed attempts. Please wait a few minutes.",
    "auth/network-request-failed": "No internet connection. Please check your network.",
    "auth/popup-closed-by-user":   "Sign-in was cancelled. Please try again.",
    "auth/cancelled-popup-request":"Only one sign-in window can be open at a time.",
  };

  // Return the friendly message, or a generic one if we don't recognize the code
  return messages[errorCode] || "Something went wrong. Please try again.";
}


// ============================================================
//  HELPER: showAuthError(errorCode)
//
//  Displays the error message in the UI.
//  Looks for an element with id="auth-error" on the page.
//  If it doesn't exist, it falls back to console.error.
// ============================================================
function showAuthError(errorCode) {
  const message = getFriendlyErrorMessage(errorCode);
  const errorEl = document.getElementById("auth-error");
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.style.display = "block";
  } else {
    console.error("Auth error:", message);
  }
}


// ============================================================
//  EXPORT — Make these functions available to other files
//
//  Because we used "type='module'" in the script tag, we need
//  to "export" functions to make them usable from other scripts.
//
//  In your HTML file, import them like this:
//  <script type="module">
//    import { signInWithGoogle, registerWithEmail } from "./firebase.js";
  window.signInWithGoogle = signInWithGoogle;
  window.registerWithEmail = registerWithEmail;
  window.signInWithEmail = signInWithEmail;
//  </script>
// ============================================================
export {
  auth,                       // The auth service (in case you need it directly)
  db,                         // The Firestore database (in case you need it directly)
  storage,                    // The Storage service
  signInWithGoogle,           // Google OAuth login
  registerWithEmail,          // Email + password signup
  signInWithEmail,            // Email + password login
  saveUserToFirestore,        // Save/update user data in Firestore
  handlePostLoginRedirect,    // Decide where to send the user after login
  completeAdminProfileSetup,  // Mark admin profile as complete (firstLogin = false)
  logOut,                     // Sign the user out
  getFriendlyErrorMessage,    // Translate Firebase error codes
  ADMIN_EMAIL                 // Export the admin email constant (read-only)
};

