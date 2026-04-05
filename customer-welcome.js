// ============================================================
//  AURA FASHION — customer-welcome.js
//  Customer Welcome Experience — Logic
//
//  HOW TO ADD:
//  Just before </body> in index.html, add:
//  <script type="module" src="customer-welcome.js"></script>
//
//  WHAT THIS FILE DOES:
//   1. Welcome popup   — shows once, never again (localStorage)
//   2. Hero typing     — store name animates letter by letter
//   3. Personal greeting — "Good evening, Amara 👋" after login
//   4. WhatsApp bubble — opens chat with pre-filled message
//
//  This file reads the store's WhatsApp number from Firestore
//  settings so it works for ANY buyer without changing the code.
// ============================================================


// ── IMPORTS ──────────────────────────────────────────────────
import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";


// ── MODULE STATE ──────────────────────────────────────────────
// Private variables — only accessible inside this file
let _whatsappNumber  = "";   // Loaded from Firestore settings
let _storeName       = "AURA"; // Loaded from Firestore settings
let _greetingTimer   = null;   // Auto-dismiss timer for greeting banner
let _heroTypingDone  = false;  // Has the hero typing animation finished?


// ============================================================
//  STARTUP — run everything in the right order
// ============================================================
document.addEventListener("DOMContentLoaded", async () => {

  // 1. Load store settings from Firestore (WhatsApp number, store name)
  await loadStoreSettings();

  // 2. Decide whether to show the welcome popup
  initWelcomePopup();

  // 3. Start the hero typing animation
  initHeroTyping();

  // 4. Show the WhatsApp bubble (with a small delay so it's not jarring)
  initWhatsAppBubble();

  // 5. Watch for login — show personal greeting when user signs in
  initPersonalGreeting();
});


// ============================================================
//  FUNCTION 1: loadStoreSettings()
//
//  Reads the store's settings from Firestore so we can use:
//   - The WhatsApp number for the chat bubble
//   - The store name for the hero and popup
//
//  This is why any buyer can use this file without changing code —
//  everything comes from their Firestore settings document.
// ============================================================
async function loadStoreSettings() {
  try {
    // Read from /settings/store — the same document admin saves to
    const settingsSnap = await getDoc(doc(db, "settings", "store"));

    if (settingsSnap.exists()) {
      const data = settingsSnap.data();

      // Clean the WhatsApp number — remove everything except digits
      // +234 801 234 5678 becomes 2348012345678
      _whatsappNumber = (data.whatsapp || "").replace(/[^0-9]/g, "");

      // Use the store name from settings, or fall back to "AURA"
      _storeName = data.storeName || "AURA";
    }

  } catch (error) {
    // Non-fatal — app still works without settings loaded
    console.warn("Could not load store settings:", error.message);
  }
}


// ============================================================
//  FUNCTION 2: initWelcomePopup()
//
//  Shows the welcome popup ONLY if the customer has never
//  visited before. We use localStorage to remember.
//
//  HOW LOCALSTORAGE WORKS HERE:
//  localStorage is like a small notepad in the browser.
//  We write "welcomed = true" the first time they visit.
//  Next time they come, we check the notepad — if it says
//  "welcomed = true", we skip the popup entirely.
//  The note stays until they clear their browser data.
// ============================================================
function initWelcomePopup() {
  const overlay = document.getElementById("welcome-overlay");
  if (!overlay) return;

  // Check if this customer has already been welcomed
  const alreadyWelcomed = localStorage.getItem("aura_welcomed");

  if (alreadyWelcomed) {
    // They've been here before — hide popup immediately, no animation
    overlay.style.display = "none";
    return;
  }

  // First visit — show the popup (it's visible by default from CSS)
  // The CSS animation handles the fade-in automatically
  console.log("First visit detected — showing welcome popup.");
}

/**
 * dismissWelcome()
 * Called when customer clicks "Enter the Store" or "Sign in here".
 * Hides the popup and writes to localStorage so it never shows again.
 */
window.dismissWelcome = function() {
  const overlay = document.getElementById("welcome-overlay");
  if (!overlay) return;

  // Mark as welcomed in localStorage — persists across visits
  localStorage.setItem("aura_welcomed", "true");

  // Add hidden class — CSS transitions it to opacity: 0
  overlay.classList.add("hidden");

  // After the CSS transition finishes (400ms), remove from DOM entirely
  // This prevents it from blocking clicks on the page underneath
  setTimeout(() => {
    overlay.style.display = "none";
  }, 450);
};


// ============================================================
//  FUNCTION 3: initHeroTyping()
//
//  Finds the hero title on the page and makes the store name
//  type itself letter by letter — like someone is typing it.
//
//  HOW THE TYPING EFFECT WORKS:
//  We start with an empty string.
//  Every 120ms we add one more letter from the store name.
//  Between each letter addition we re-render the element.
//  A blinking cursor character is added at the end.
//  When all letters are typed, the cursor disappears after 2s.
// ============================================================
function initHeroTyping() {
  // Find the hero title element — it should have class .hero-title
  // or an id of "hero-title" in your index.html
  const heroTitle = document.querySelector(".hero-title") ||
                    document.getElementById("hero-title");
  if (!heroTitle) return;

  // Save the original content (in case it has children like <em> tags)
  // We'll use a simpler approach — just animate the text content
  const originalHTML = heroTitle.innerHTML;

  // The text we want to type — the store name
  // We split "AURA" into individual characters: ["A", "U", "R", "A"]
  const textToType = _storeName || "AURA";
  const letters    = textToType.split("");

  // Start empty
  heroTitle.innerHTML = '<span class="cursor"></span>';

  let currentIndex = 0; // Which letter we're on right now

  // setInterval calls a function repeatedly at a set time interval
  // Every 120ms (milliseconds), we add one more letter
  const typingInterval = setInterval(() => {

    if (currentIndex < letters.length) {
      // Add the next letter
      const typedSoFar = letters.slice(0, currentIndex + 1).join("");

      // Re-render with typed text + blinking cursor at the end
      heroTitle.innerHTML = typedSoFar + '<span class="cursor"></span>';

      currentIndex++; // Move to next letter

    } else {
      // All letters are typed — stop the interval
      clearInterval(typingInterval);
      _heroTypingDone = true;

      // Keep cursor for 2 more seconds then remove it
      // (It feels natural — like finishing typing and then pausing)
      setTimeout(() => {
        const cursor = heroTitle.querySelector(".cursor");
        if (cursor) {
          cursor.style.animation = "none";
          cursor.style.opacity   = "0";
          cursor.style.transition = "opacity 0.5s ease";
          setTimeout(() => cursor.remove(), 500);
        }

        // Add the warm subtitle below the hero title
        addHeroSubtitle();

      }, 2000); // Wait 2 seconds after typing finishes
    }

  }, 120); // Type one letter every 120 milliseconds
}

/**
 * addHeroSubtitle()
 * Adds the warm subtitle and gold line below the hero title
 * after the typing animation completes.
 */
function addHeroSubtitle() {
  // Find where to insert the subtitle
  const hero = document.querySelector(".hero") ||
               document.querySelector("section.hero");
  if (!hero) return;

  // Only add if it doesn't already exist
  if (document.getElementById("hero-warm-sub")) return;

  // Create the warm subtitle element
  const sub = document.createElement("p");
  sub.id        = "hero-warm-sub";
  sub.className = "hero-warm-sub";
  sub.textContent = "Curated with love · Made for you";

  // Create the gold underline
  const line = document.createElement("div");
  line.className = "hero-gold-line";

  // Insert after the hero title
  const heroTitle = document.querySelector(".hero-title");
  if (heroTitle) {
    heroTitle.insertAdjacentElement("afterend", line);
    heroTitle.insertAdjacentElement("afterend", sub);
  } else {
    hero.appendChild(sub);
    hero.appendChild(line);
  }
}


// ============================================================
//  FUNCTION 4: initPersonalGreeting()
//
//  Watches for Firebase login events.
//  When a customer logs in, shows a warm personalised greeting
//  banner at the top of the screen with their name.
//
//  The greeting knows the time of day and picks the right words:
//    Morning (5am-12pm)  → "Good morning"
//    Afternoon (12-5pm)  → "Good afternoon"
//    Evening (5pm-9pm)   → "Good evening"
//    Night (9pm-5am)     → "Good night"
// ============================================================
function initPersonalGreeting() {

  // onAuthStateChanged fires whenever login state changes
  onAuthStateChanged(auth, (user) => {

    if (user) {
      // ── Customer is logged in ─────────────────────────────
      // Get their display name — try multiple sources
      const firstName = extractFirstName(
        user.displayName ||           // Google login provides this
        user.email.split("@")[0] ||   // Use email prefix as fallback
        "friend"                      // Ultimate fallback
      );

      // Show the personalised greeting banner
      showPersonalGreeting(firstName, user.email);

    } else {
      // ── Customer logged out — hide the greeting ───────────
      hideGreetingBanner();
    }
  });
}

/**
 * extractFirstName(fullName)
 * Takes a full name and returns just the first name.
 * "Amara Okafor" → "Amara"
 * "john.doe" → "John" (capitalizes first letter)
 *
 * @param {string} fullName - The full display name
 * @returns {string} - Just the first name, capitalized
 */
function extractFirstName(fullName) {
  if (!fullName) return "friend";
  // Split on space, take first part, capitalize first letter
  const first = fullName.trim().split(" ")[0];
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

/**
 * getTimeGreeting()
 * Returns the right greeting for the current time of day.
 *
 * @returns {string} - "Good morning" | "Good afternoon" | "Good evening" | "Good night"
 */
function getTimeGreeting() {
  const hour = new Date().getHours(); // 0-23 (24-hour clock)

  if (hour >= 5  && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 21) return "Good evening";
  return "Good night"; // 9pm - 5am
}

/**
 * getWarmSubMessage(firstName)
 * Returns a warm, varied sub-message so it doesn't feel robotic.
 * Picks one randomly from a list.
 *
 * @param {string} firstName - Customer's first name
 * @returns {string} - A warm welcome sub-message
 */
function getWarmSubMessage(firstName) {
  const messages = [
    "So glad you're here. Let's find something beautiful.",
    `${firstName}, your style is waiting. ✨`,
    "New arrivals are in — we saved the best for you.",
    "Welcome back. Your cart is right where you left it.",
    "You have great taste for coming back. 🤍",
    "Ready to find your next favourite piece?",
  ];
  // Pick a random message from the array
  return messages[Math.floor(Math.random() * messages.length)];
}

/**
 * showPersonalGreeting(firstName, email)
 * Renders and shows the greeting banner with the customer's name.
 * Auto-dismisses after 5 seconds.
 *
 * @param {string} firstName - Customer's first name
 * @param {string} email     - Customer's email (used for personalisation)
 */
function showPersonalGreeting(firstName, email) {
  const banner   = document.getElementById("greeting-banner");
  const timeEl   = document.getElementById("greeting-time-text");
  const nameEl   = document.getElementById("greeting-name");
  const subEl    = document.getElementById("greeting-sub");

  if (!banner) return;

  // Fill in the personalised content
  if (timeEl) timeEl.textContent = getTimeGreeting();
  if (nameEl) nameEl.textContent = firstName;
  if (subEl)  subEl.textContent  = getWarmSubMessage(firstName);

  // Small delay before sliding in — feels more intentional
  setTimeout(() => {
    banner.classList.add("visible");
  }, 600);

  // Auto-dismiss after 5 seconds
  // Customer doesn't have to interact — it slides away on its own
  clearTimeout(_greetingTimer);
  _greetingTimer = setTimeout(dismissGreeting, 5000);
}

/**
 * dismissGreeting()
 * Hides the greeting banner — called by the ✕ button
 * or automatically after 5 seconds.
 */
window.dismissGreeting = function() {
  const banner = document.getElementById("greeting-banner");
  if (banner) banner.classList.remove("visible");
  clearTimeout(_greetingTimer);
};


// ============================================================
//  FUNCTION 5: initWhatsAppBubble()
//
//  Shows the WhatsApp chat bubble after a 1.5 second delay.
//  The delay prevents it from competing with the welcome popup
//  on first visits — lets the customer settle in first.
// ============================================================
function initWhatsAppBubble() {
  const bubble = document.getElementById("wa-bubble");
  if (!bubble) return;

  // Show the bubble after 1.5 seconds
  // The CSS transition handles the slide-in animation
  setTimeout(() => {
    bubble.classList.add("visible");
  }, 1500);
}

/**
 * openWhatsAppChat()
 * Called when the customer taps the WhatsApp bubble.
 * Opens WhatsApp with a friendly pre-filled message.
 *
 * The message tells the store who is interested and what page
 * they're on — makes it easy for the admin to respond.
 *
 * encodeURIComponent() makes the message URL-safe (converts
 * spaces and special characters so the link doesn't break).
 */
window.openWhatsAppChat = function() {

  if (!_whatsappNumber) {
    // WhatsApp not configured — show a friendly fallback
    console.warn("WhatsApp number not configured in store settings.");
    // Try to show a toast if the toast system is loaded
    if (window.showToast) {
      window.showToast("Chat coming soon! 💬", "neutral");
    }
    return;
  }

  // Get the current user's name if they're logged in
  const user      = auth.currentUser;
  const userName  = user?.displayName || user?.email?.split("@")[0] || "a customer";

  // Build a warm, natural opening message
  // This is what appears pre-typed in WhatsApp when the chat opens
  const message =
`Hello ${_storeName}! 👋

I'm interested in shopping with you.

${user ? `My name is ${extractFirstName(userName)}.` : ""}

Could you help me find something? 🛍`;

  // Convert the message to a URL-safe string
  // Spaces become %20, newlines become %0A, etc.
  const encodedMessage = encodeURIComponent(message);

  // Build the WhatsApp deep link
  // wa.me/{number}?text={message} opens WhatsApp with pre-filled text
  const whatsappURL = `https://wa.me/${_whatsappNumber}?text=${encodedMessage}`;

  // Open in a new tab — on mobile this opens the WhatsApp app directly
  const newWindow = window.open(whatsappURL, "_blank");

  // Fallback if browser blocks the popup
  if (!newWindow) {
    window.location.href = whatsappURL;
  }

  // Remove the notification dot after first click
  // (They've seen it — no need to keep showing the dot)
  const dot = document.querySelector(".wa-bubble__dot");
  if (dot) {
    dot.style.transform = "scale(0)";
    dot.style.transition = "transform 0.2s ease";
    setTimeout(() => dot.remove(), 200);
  }
};


// ============================================================
//  BONUS: New Collection Toast
//
//  Shows a subtle toast notification after the page loads
//  letting customers know there are new items.
//  Only shows once per session (sessionStorage resets on tab close).
// ============================================================
function showNewCollectionHint() {
  // sessionStorage resets when the browser tab closes
  // So this shows once per session — not once ever like localStorage
  const shownThisSession = sessionStorage.getItem("aura_collection_hint");
  if (shownThisSession) return;

  // Wait 4 seconds after page load before showing
  // (Let the welcome popup and hero animation finish first)
  setTimeout(() => {
    if (window.showToast) {
      window.showToast("✨ New arrivals just dropped — check them out!", "gold", 4000);
      sessionStorage.setItem("aura_collection_hint", "true");
    }
  }, 4000);
}

// Call the new collection hint after everything else loads
setTimeout(showNewCollectionHint, 1000);


// ============================================================
//  EXPOSE PUBLIC FUNCTIONS
//  These need to be on window because the HTML onclick
//  attributes call them directly.
// ============================================================
window.dismissWelcome   = window.dismissWelcome;   // Already set above
window.dismissGreeting  = window.dismissGreeting;  // Already set above
window.openWhatsAppChat = window.openWhatsAppChat; // Already set above

console.log("Customer welcome module loaded ✓");
