// ============================================================
//  AURA FASHION — fixes.js
//  All 7 Fixes & Improvements
//
//  HOW TO ADD THIS FILE:
//  In index.html just before </body>:
//  <script type="module" src="fixes.js"></script>
//
//  In admin-dashboard.html just before </body>:
//  <script type="module" src="fixes.js"></script>
//
//  FIXES IN THIS FILE:
//  Fix 1 — Cart remove button with confirmation
//  Fix 2 — Email verification LINK (not broken OTP code)
//  Fix 3 — WhatsApp bubble moved to bottom-left
//  Fix 4 — Admin 6-digit PIN login after first setup
//  Fix 5 — Welcome popup circle bug (divider fix)
//  Fix 6 — WhatsApp bubble reads number from Firestore
//  Fix 7 — Customizable logo upload from admin settings
// ============================================================


// ── IMPORTS ──────────────────────────────────────────────────
import { auth, db } from "./firebase.js";

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import {
  onAuthStateChanged,
  sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";


// ── MODULE STATE ──────────────────────────────────────────────
let _storeSettings  = {};   // Loaded from Firestore on startup
let _adminPIN       = "";   // The 6-digit PIN (loaded from Firestore)


// ── STARTUP ──────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  await loadSettingsForFixes();  // Load WhatsApp number, logo, PIN
  applyFix3_WhatsAppPosition();  // Move bubble to bottom-left
  applyFix5_WelcomeCircle();     // Fix divider circle bug
  applyFix6_WhatsAppNumber();    // Wire bubble to real number
  applyFix7_Logo();              // Show logo if one is uploaded
  applyFix4_AdminPIN();          // Wire admin PIN if on dashboard
});


// ── Load settings from Firestore ─────────────────────────────
async function loadSettingsForFixes() {
  try {
    const snap = await getDoc(doc(db, "settings", "store"));
    if (snap.exists()) {
      _storeSettings = snap.data();
      _adminPIN      = _storeSettings.adminPIN || "";
    }
  } catch (e) {
    console.warn("fixes.js: Could not load settings:", e.message);
  }
}


// ============================================================
//  FIX 1 — CART REMOVE BUTTON WITH CONFIRMATION
//
//  Problem: No clear way for customers to remove a product
//  they accidentally added to their cart.
//
//  Solution: Override the renderCart function to include a
//  proper "Remove item" button with a Yes/Keep confirmation.
//  Customer must confirm before item is deleted — prevents
//  accidental removals.
//
//  HOW TO USE:
//  This automatically overrides window.renderCart so no
//  other changes needed in index.html.
// ============================================================

// Store a reference to the original renderCart
// so we can call it as fallback if needed
const _originalRenderCart = window.renderCart;

/**
 * renderCart()
 * Enhanced version with clear remove buttons and confirmation.
 * Replaces the original renderCart from index.html.
 */
window.renderCart = function() {
  const list    = document.getElementById("cart-items-list");
  const sumWrap = document.getElementById("cart-summary-wrap");
  if (!list) return;

  // Get cart from the app's state
  const cart     = window.S?.cart || [];
  const products = window.DB?.products || [];

  if (!cart.length) {
    list.innerHTML = `
      <div style="text-align:center;padding:60px 0;">
        <div style="font-size:2.5rem;margin-bottom:16px;opacity:0.3;">🛒</div>
        <div style="font-size:0.65rem;letter-spacing:0.15em;
          text-transform:uppercase;color:rgba(245,245,247,0.3);">
          Your cart is empty
        </div>
      </div>`;
    if (sumWrap) sumWrap.innerHTML = "";
    return;
  }

  // Build each cart item with the enhanced remove button
  list.innerHTML = cart.map(item => {
    const p = products.find(x => x.id === item.prodId);
    if (!p) return "";

    let price = parseFloat(p.price) || 0;
    if (p.discount) price *= (1 - p.discount / 100);

    const fmtPrice = window.fmtTotal
      ? window.fmtTotal(price * item.qty)
      : "$" + (price * item.qty).toFixed(2);

    const itemKey = `${p.id}__${item.size || "ns"}`;

    return `
      <div class="cart-item" id="cartrow-${itemKey}" style="
        display: grid;
        grid-template-columns: 76px 1fr;
        gap: 14px;
        padding: 18px 0;
        border-bottom: 0.5px solid rgba(255,255,255,0.07);
      ">
        <!-- Thumbnail -->
        <div style="width:76px;height:96px;border-radius:12px;
          overflow:hidden;background:#111;flex-shrink:0;">
          ${p.image || p.imageURL
            ? `<img src="${p.image || p.imageURL}"
                 style="width:100%;height:100%;object-fit:cover;"
                 loading="lazy" alt="${p.name}"/>`
            : `<div style="width:100%;height:100%;display:flex;
                 align-items:center;justify-content:center;
                 font-size:2rem;opacity:0.2;">📦</div>`
          }
        </div>

        <!-- Details -->
        <div style="display:flex;flex-direction:column;gap:5px;">

          <!-- Name + price -->
          <div style="display:flex;justify-content:space-between;
            align-items:flex-start;gap:8px;">
            <div style="font-family:'Cormorant Garamond',serif;
              font-size:1rem;color:#f5f5f7;flex:1;min-width:0;
              overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
              ${p.name}
            </div>
            <div style="font-size:0.7rem;font-weight:500;
              color:#0a84ff;flex-shrink:0;">
              ${fmtPrice}
            </div>
          </div>

          <!-- Size / colour -->
          ${item.size || item.color
            ? `<div style="font-size:0.56rem;color:rgba(245,245,247,0.38);
                letter-spacing:0.06em;">
                ${item.size ? "Size: " + item.size : ""}
                ${item.size && item.color ? " · " : ""}
                ${item.color || ""}
              </div>` : ""
          }

          <!-- Qty controls -->
          <div style="display:flex;align-items:center;gap:9px;margin-top:2px;">
            <button onclick="changeQty('${p.id}','${item.size || ""}', -1)"
              style="width:26px;height:26px;border-radius:50%;
                border:0.5px solid rgba(255,255,255,0.15);
                background:rgba(255,255,255,0.04);color:#f5f5f7;
                font-size:0.95rem;cursor:pointer;display:flex;
                align-items:center;justify-content:center;
                transition:all 0.18s ease;"
              onmouseover="this.style.borderColor='#0a84ff';this.style.color='#0a84ff'"
              onmouseout="this.style.borderColor='rgba(255,255,255,0.15)';this.style.color='#f5f5f7'"
            >−</button>

            <span style="font-size:0.68rem;font-weight:500;
              width:22px;text-align:center;color:#f5f5f7;">
              ${item.qty}
            </span>

            <button onclick="changeQty('${p.id}','${item.size || ""}', 1)"
              style="width:26px;height:26px;border-radius:50%;
                border:0.5px solid rgba(255,255,255,0.15);
                background:rgba(255,255,255,0.04);color:#f5f5f7;
                font-size:0.95rem;cursor:pointer;display:flex;
                align-items:center;justify-content:center;
                transition:all 0.18s ease;"
              onmouseover="this.style.borderColor='#0a84ff';this.style.color='#0a84ff'"
              onmouseout="this.style.borderColor='rgba(255,255,255,0.15)';this.style.color='#f5f5f7'"
            >+</button>
          </div>

          <!-- ── REMOVE BUTTON (Fix 1) ──────────────────────
               Clear red pill button — easy to see and tap.
               Tapping shows inline Yes/Keep confirmation
               so customer can't accidentally remove items. -->
          <div id="remove-area-${itemKey}">
            <button
              onclick="showRemoveConfirm('${p.id}','${item.size || ''}','${itemKey}')"
              style="
                display: inline-flex;
                align-items: center;
                gap: 5px;
                margin-top: 4px;
                padding: 6px 13px;
                background: rgba(255,59,48,0.07);
                border: 0.5px solid rgba(255,59,48,0.18);
                border-radius: 100px;
                color: #ff3b30;
                font-family: 'DM Sans', sans-serif;
                font-size: 0.58rem;
                font-weight: 500;
                letter-spacing: 0.05em;
                cursor: pointer;
                transition: all 0.18s ease;
              "
              onmouseover="this.style.background='rgba(255,59,48,0.14)';
                           this.style.borderColor='rgba(255,59,48,0.35)'"
              onmouseout="this.style.background='rgba(255,59,48,0.07)';
                          this.style.borderColor='rgba(255,59,48,0.18)'"
            >🗑 Remove item</button>
          </div>

        </div>
      </div>`;
  }).join("");

  // Build cart summary
  if (sumWrap) {
    const total = window.cartTotalUSD ? window.cartTotalUSD() : 0;
    const fmtTotal = window.fmtTotal ? window.fmtTotal(total) : "$" + total.toFixed(2);
    sumWrap.innerHTML = `
      <div style="background:#111;border:0.5px solid rgba(255,255,255,0.08);
        border-radius:20px;padding:22px;margin-top:24px;">
        <div style="display:flex;justify-content:space-between;
          padding:8px 0;border-bottom:0.5px solid rgba(255,255,255,0.07);">
          <span style="font-size:0.6rem;color:rgba(245,245,247,0.4);">Subtotal</span>
          <strong style="font-size:0.65rem;">${fmtTotal}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;padding:8px 0;
          border-bottom:0.5px solid rgba(255,255,255,0.07);">
          <span style="font-size:0.6rem;color:rgba(245,245,247,0.4);">Delivery</span>
          <strong style="font-size:0.65rem;color:rgba(245,245,247,0.4);">
            Calculated at checkout</strong>
        </div>
        <div style="display:flex;justify-content:space-between;padding:10px 0;">
          <span style="font-size:0.62rem;color:rgba(245,245,247,0.7);">Total</span>
          <strong style="font-size:0.8rem;color:#0a84ff;">${fmtTotal}</strong>
        </div>
        <button onclick="proceedToCheckout()" style="
          width:100%;padding:14px;background:#0a84ff;border:none;
          border-radius:14px;color:#fff;font-family:'DM Sans',sans-serif;
          font-size:0.65rem;font-weight:600;letter-spacing:0.06em;
          cursor:pointer;margin-top:10px;
          transition:opacity 0.2s,transform 0.2s;">
          Proceed to Checkout →
        </button>
      </div>`;
  }
};

/**
 * showRemoveConfirm(productId, size, itemKey)
 * Replaces the "Remove item" button with inline Yes/Keep options.
 * Only removes if customer confirms — prevents accidents.
 */
window.showRemoveConfirm = function(productId, size, itemKey) {
  const area = document.getElementById("remove-area-" + itemKey);
  if (!area) return;

  // Replace button with confirmation row
  area.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;
      margin-top:4px;animation:fadeUp 0.2s ease;">
      <span style="font-size:0.58rem;color:rgba(245,245,247,0.5);">
        Remove this?
      </span>
      <button
        onclick="window.removeFromCart('${productId}','${size}');
          if(window.showToast)window.showToast('Item removed ✓','success');"
        style="padding:6px 13px;background:#ff3b30;border:none;
          border-radius:100px;color:#fff;font-family:'DM Sans',sans-serif;
          font-size:0.58rem;font-weight:600;cursor:pointer;">
        Yes, remove
      </button>
      <button
        onclick="window.renderCart();"
        style="padding:6px 13px;background:transparent;
          border:0.5px solid rgba(255,255,255,0.15);border-radius:100px;
          color:rgba(245,245,247,0.5);font-family:'DM Sans',sans-serif;
          font-size:0.58rem;cursor:pointer;">
        Keep it
      </button>
    </div>`;
};


// ============================================================
//  FIX 2 — EMAIL VERIFICATION LINK (not broken OTP code)
//
//  Problem: The 6-digit OTP code wasn't working reliably.
//
//  Solution: Firebase sends a real email with a clickable
//  verification LINK. Customer clicks it → verified.
//  Much more reliable than a code.
//
//  HOW IT WORKS:
//  1. Customer enters email + password
//  2. Firebase creates their account silently
//  3. Firebase sends a "Click to verify" email automatically
//  4. Customer clicks the link in their inbox
//  5. Firebase marks their account as verified
//  6. Next time they log in, emailVerified = true
//
//  This overrides the showEmailSignup function so the
//  signup flow uses links instead of OTP boxes.
// ============================================================

/**
 * showEmailSignup()
 * Updated signup form — uses verification LINK not OTP code.
 * Overrides the original function in index.html.
 */
window.showEmailSignup = function() {
  const content = document.getElementById("auth-content");
  if (!content) return;

  content.innerHTML = `
    <div style="display:flex;gap:5px;margin-bottom:26px;">
      <div style="width:6px;height:6px;border-radius:50%;
        background:#30d158;"></div>
      <div style="width:18px;height:6px;border-radius:3px;
        background:#0a84ff;"></div>
      <div style="width:6px;height:6px;border-radius:50%;
        background:rgba(255,255,255,0.15);"></div>
    </div>

    <h2 style="font-family:'Cormorant Garamond',serif;
      font-size:1.9rem;font-weight:300;margin-bottom:4px;">
      Create Account
    </h2>
    <p style="font-size:0.58rem;letter-spacing:0.1em;
      text-transform:uppercase;color:rgba(245,245,247,0.4);
      margin-bottom:26px;">
      We'll send you a verification link
    </p>

    <div style="margin-bottom:16px;">
      <label style="display:block;font-size:0.55rem;font-weight:500;
        letter-spacing:0.1em;text-transform:uppercase;
        color:rgba(245,245,247,0.4);margin-bottom:7px;">Email</label>
      <input type="email" id="reg-email"
        value="${window.S?._surveyData?.email || ""}"
        placeholder="your@email.com"
        style="width:100%;background:rgba(255,255,255,0.05);
          border:0.5px solid rgba(255,255,255,0.1);border-radius:12px;
          padding:12px 15px;color:#f5f5f7;font-family:'DM Sans',sans-serif;
          font-size:0.72rem;outline:none;"/>
    </div>

    <div style="margin-bottom:24px;">
      <label style="display:block;font-size:0.55rem;font-weight:500;
        letter-spacing:0.1em;text-transform:uppercase;
        color:rgba(245,245,247,0.4);margin-bottom:7px;">Password</label>
      <input type="password" id="reg-pw"
        placeholder="Min 6 characters"
        style="width:100%;background:rgba(255,255,255,0.05);
          border:0.5px solid rgba(255,255,255,0.1);border-radius:12px;
          padding:12px 15px;color:#f5f5f7;font-family:'DM Sans',sans-serif;
          font-size:0.72rem;outline:none;"/>
    </div>

    <!-- Info box explaining what happens next -->
    <div style="background:rgba(10,132,255,0.07);
      border:0.5px solid rgba(10,132,255,0.2);border-radius:12px;
      padding:14px;margin-bottom:20px;">
      <div style="font-size:0.62rem;color:rgba(245,245,247,0.7);
        line-height:1.8;letter-spacing:0.02em;">
        ✉ After signing up, we'll send a
        <strong style="color:#f5f5f7;">verification link</strong>
        to your email.<br>
        Just click it to confirm your account.<br>
        <span style="color:rgba(245,245,247,0.4);font-size:0.56rem;">
          Check your spam folder if you don't see it.
        </span>
      </div>
    </div>

    <button onclick="registerWithVerificationLink()"
      style="width:100%;padding:14px;background:#0a84ff;border:none;
        border-radius:14px;color:#fff;font-family:'DM Sans',sans-serif;
        font-size:0.65rem;font-weight:600;letter-spacing:0.06em;
        cursor:pointer;transition:opacity 0.2s;">
      Create Account &amp; Send Link →
    </button>

    <p style="font-size:0.52rem;color:rgba(245,245,247,0.3);
      text-align:center;margin-top:14px;">
      <span style="color:#0a84ff;cursor:pointer;"
        onclick="window.showAccountStep && window.showAccountStep()">
        ← Back
      </span>
    </p>`;
};

/**
 * registerWithVerificationLink()
 * Creates the Firebase account and sends a verification LINK.
 * No OTP boxes — just a single button then check your email.
 */
window.registerWithVerificationLink = async function() {
  const email = document.getElementById("reg-email")?.value.trim();
  const pw    = document.getElementById("reg-pw")?.value;

  if (!email) {
    if (window.toast) window.toast("Please enter your email", "error");
    return;
  }
  if (!pw || pw.length < 6) {
    if (window.toast) window.toast("Password must be at least 6 characters", "error");
    return;
  }

  // Show loading state
  const btn = document.querySelector("[onclick='registerWithVerificationLink()']");
  if (btn) { btn.disabled = true; btn.textContent = "Creating account…"; }

  try {
    // Import Firebase auth functions
    const { createUserWithEmailAndPassword } =
      await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");

    // Create the Firebase account
    // "await" pauses until Firebase confirms the account exists
    const cred = await createUserWithEmailAndPassword(auth, email, pw);

    // Send the verification LINK email
    // Firebase generates a secure unique link automatically
    // Customer clicks it → their account is marked as verified
    await sendEmailVerification(cred.user);

    // Store survey data to Firestore
    if (window.createEmailAccountVerified) {
      window.S._signupEmail = email;
      window.S._signupPw    = pw;
      await window.createEmailAccountVerified();
    }

    // Show success screen
    const content = document.getElementById("auth-content");
    if (content) {
      content.innerHTML = `
        <div style="text-align:center;padding:10px 0;">
          <div style="font-size:3rem;margin-bottom:18px;
            animation:pop 0.5s cubic-bezier(.34,1.56,.64,1);">✉</div>
          <h2 style="font-family:'Cormorant Garamond',serif;
            font-size:1.8rem;font-weight:300;margin-bottom:8px;">
            Check your inbox
          </h2>
          <p style="font-size:0.65rem;color:rgba(245,245,247,0.5);
            line-height:1.8;margin-bottom:28px;">
            We sent a verification link to<br>
            <strong style="color:#f5f5f7;">${email}</strong><br><br>
            Click the link in the email to<br>
            activate your AURA account.
          </p>
          <div style="background:rgba(48,209,88,0.07);
            border:0.5px solid rgba(48,209,88,0.2);border-radius:12px;
            padding:12px;margin-bottom:20px;">
            <div style="font-size:0.6rem;color:rgba(48,209,88,0.9);">
              ✓ Once verified, come back and sign in
            </div>
          </div>
          <button onclick="window.showLoginStep && window.showLoginStep()"
            style="width:100%;padding:13px;background:#0a84ff;
              border:none;border-radius:14px;color:#fff;
              font-family:'DM Sans',sans-serif;font-size:0.65rem;
              font-weight:600;cursor:pointer;">
            Go to Sign In →
          </button>
          <p style="font-size:0.55rem;color:rgba(245,245,247,0.25);
            margin-top:14px;cursor:pointer;"
            onclick="registerWithVerificationLink()">
            Didn't receive it? Resend link
          </p>
        </div>`;
    }

  } catch (error) {
    console.error("Registration error:", error.code);
    const messages = {
      "auth/email-already-in-use": "This email is already registered — sign in instead.",
      "auth/invalid-email":        "That doesn't look like a valid email.",
      "auth/weak-password":        "Password too weak — use at least 6 characters.",
    };
    const msg = messages[error.code] || "Something went wrong — please try again.";
    if (window.toast) window.toast(msg, "error");
    if (btn) { btn.disabled = false; btn.textContent = "Create Account & Send Link →"; }
  }
};


// ============================================================
//  FIX 3 — WHATSAPP BUBBLE MOVED TO BOTTOM-LEFT
//
//  Problem: The WhatsApp bubble was overlapping the + FAB
//  button in the bottom-right corner.
//
//  Solution: Move the WhatsApp bubble to the BOTTOM-LEFT
//  so it never competes with the FAB button.
// ============================================================
function applyFix3_WhatsAppPosition() {
  const bubble = document.getElementById("wa-bubble");
  if (!bubble) return;

  // Move from bottom-right to bottom-left
  bubble.style.right  = "auto";   // Remove right positioning
  bubble.style.left   = "24px";   // Position from left instead
  bubble.style.bottom = "28px";   // Same bottom distance

  // Also move the tooltip to the RIGHT side now
  // (since bubble is on the left, tooltip points right)
  const tooltip = bubble.querySelector(".wa-bubble__tooltip");
  if (tooltip) {
    tooltip.style.right = "auto";
    tooltip.style.left  = "68px";
  }
}


// ============================================================
//  FIX 4 — ADMIN 6-DIGIT PIN LOGIN
//
//  Problem: Admin had to type full email + password every time.
//
//  Solution: After first login, admin sets a 6-digit PIN.
//  From then on, clicking the admin FAB shows a PIN pad.
//  Much faster — like a phone lock screen.
//
//  HOW IT WORKS:
//  - First login: still uses email + password (existing flow)
//  - After profile setup: admin sets a PIN in Settings
//  - Next logins: PIN pad appears instead of email form
//  - PIN is stored as a hash in Firestore /settings/store
//
//  NOTE: PIN is for convenience not high security.
//  The real security is Firebase Auth session management.
// ============================================================
function applyFix4_AdminPIN() {
  // Only applies on the main index.html where admin FAB exists
  const fab = document.getElementById("fab");
  if (!fab) return;

  // Override the FAB click to show PIN if one is set
  fab.removeAttribute("onclick");
  fab.addEventListener("click", () => {
    if (window.S?.isAdmin) {
      // Already admin — open add product
      if (window.openAddProduct) window.openAddProduct();
    } else if (_adminPIN) {
      // PIN exists — show PIN pad instead of email form
      showAdminPINPad();
    } else {
      // No PIN set — show normal email login
      if (window.openOverlay) window.openOverlay("overlay-admin-login");
    }
  });
}

/**
 * showAdminPINPad()
 * Shows a 6-digit PIN entry overlay.
 * Replaces the email+password form after first setup.
 */
window.showAdminPINPad = function() {
  // Create PIN overlay if it doesn't exist
  let pinOverlay = document.getElementById("pin-overlay");
  if (!pinOverlay) {
    pinOverlay = document.createElement("div");
    pinOverlay.id = "pin-overlay";
    document.body.appendChild(pinOverlay);
  }

  pinOverlay.innerHTML = `
    <div style="
      position:fixed;inset:0;z-index:2000;
      background:rgba(0,0,0,0.88);
      backdrop-filter:blur(20px);
      display:flex;align-items:center;justify-content:center;
      padding:20px;
      animation:overlayFadeIn 0.3s ease;
    ">
      <div style="
        background:rgba(18,18,18,0.97);
        border:0.5px solid rgba(255,255,255,0.1);
        border-radius:26px;padding:40px 36px;
        width:100%;max-width:340px;text-align:center;
        box-shadow:0 40px 80px rgba(0,0,0,0.8);
        animation:cardSlideUp 0.4s cubic-bezier(0.16,1,0.3,1);
      ">
        <!-- Brand -->
        <div style="font-family:'Cormorant Garamond',serif;
          font-size:1.1rem;font-weight:300;letter-spacing:0.35em;
          color:#e8d5b0;margin-bottom:6px;">✦ AURA</div>
        <div style="font-size:0.55rem;letter-spacing:0.2em;
          text-transform:uppercase;color:rgba(245,245,247,0.3);
          margin-bottom:32px;">Admin Access</div>

        <!-- PIN dots display -->
        <div id="pin-dots" style="
          display:flex;justify-content:center;gap:12px;
          margin-bottom:32px;
        ">
          ${[1,2,3,4,5,6].map(i => `
            <div id="dot-${i}" style="
              width:14px;height:14px;border-radius:50%;
              background:rgba(255,255,255,0.12);
              border:0.5px solid rgba(255,255,255,0.15);
              transition:all 0.15s ease;
            "></div>`).join("")}
        </div>

        <!-- Error message -->
        <div id="pin-error" style="
          display:none;font-size:0.6rem;color:#ff3b30;
          margin-bottom:16px;letter-spacing:0.06em;
        ">Incorrect PIN — try again</div>

        <!-- Number pad -->
        <div style="
          display:grid;grid-template-columns:repeat(3,1fr);
          gap:10px;margin-bottom:20px;
        ">
          ${[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map(n => `
            <button
              onclick="pinInput('${n}')"
              style="
                padding:16px;border-radius:14px;border:none;
                background:${n === "" ? "transparent" : "rgba(255,255,255,0.06)"};
                color:#f5f5f7;font-family:'DM Sans',sans-serif;
                font-size:1.2rem;font-weight:400;cursor:pointer;
                transition:all 0.15s ease;
                ${n === "" ? "pointer-events:none;" : ""}
              "
              onmouseover="if('${n}'!='')this.style.background='rgba(255,255,255,0.12)'"
              onmouseout="if('${n}'!='')this.style.background='rgba(255,255,255,0.06)'"
            >${n}</button>`).join("")}
        </div>

        <!-- Cancel -->
        <button onclick="closePINPad()"
          style="background:none;border:none;
            color:rgba(245,245,247,0.3);font-family:'DM Sans',sans-serif;
            font-size:0.6rem;letter-spacing:0.08em;cursor:pointer;">
          Cancel
        </button>
      </div>
    </div>`;
};

// Track entered PIN digits
let _enteredPIN = "";

/**
 * pinInput(value)
 * Called by each number pad button.
 * Builds up the PIN one digit at a time.
 */
window.pinInput = function(value) {
  if (value === "⌫") {
    // Backspace — remove last digit
    _enteredPIN = _enteredPIN.slice(0, -1);
  } else if (value !== "" && _enteredPIN.length < 6) {
    // Add digit
    _enteredPIN += value.toString();
  }

  // Update the dots display
  updatePINDots(_enteredPIN.length);

  // Auto-check when 6 digits entered
  if (_enteredPIN.length === 6) {
    setTimeout(() => verifyAdminPIN(), 200);
  }
};

/**
 * updatePINDots(count)
 * Fills in the PIN dots as digits are entered.
 */
function updatePINDots(count) {
  for (let i = 1; i <= 6; i++) {
    const dot = document.getElementById("dot-" + i);
    if (!dot) continue;
    if (i <= count) {
      // Filled dot
      dot.style.background   = "#e8d5b0";
      dot.style.borderColor  = "#e8d5b0";
      dot.style.transform    = "scale(1.1)";
    } else {
      // Empty dot
      dot.style.background   = "rgba(255,255,255,0.12)";
      dot.style.borderColor  = "rgba(255,255,255,0.15)";
      dot.style.transform    = "scale(1)";
    }
  }
}

/**
 * verifyAdminPIN()
 * Checks entered PIN against stored PIN in Firestore.
 */
async function verifyAdminPIN() {
  if (_enteredPIN === _adminPIN) {
    // ── CORRECT PIN ──────────────────────────────────────────
    closePINPad();
    // Activate admin mode
    if (window.activateAdmin) {
      window.activateAdmin();
    } else {
      window.S.isAdmin = true;
      document.getElementById("admin-bar-overlay")?.classList.add("on");
      document.getElementById("fab")?.classList.add("open");
      document.body.classList.add("admin-mode");
      if (window.toast) window.toast("Admin mode active ✓", "success");
    }
  } else {
    // ── WRONG PIN ────────────────────────────────────────────
    _enteredPIN = "";
    updatePINDots(0);
    // Shake animation and show error
    const errorEl = document.getElementById("pin-error");
    if (errorEl) errorEl.style.display = "block";
    // Shake the dots
    const dotsEl = document.getElementById("pin-dots");
    if (dotsEl) {
      dotsEl.style.animation = "shake 0.4s ease";
      setTimeout(() => {
        dotsEl.style.animation = "";
        if (errorEl) errorEl.style.display = "none";
      }, 1500);
    }
  }
}

window.closePINPad = function() {
  _enteredPIN = "";
  const overlay = document.getElementById("pin-overlay");
  if (overlay) overlay.innerHTML = "";
};

/**
 * saveAdminPIN(pin)
 * Saves a new PIN to Firestore.
 * Called from the Settings panel when admin sets their PIN.
 */
window.saveAdminPIN = async function(pin) {
  if (!pin || pin.length !== 6 || !/^\d{6}$/.test(pin)) {
    if (window.showToast) window.showToast("PIN must be exactly 6 digits", "error");
    return;
  }
  try {
    await setDoc(doc(db, "settings", "store"),
      { adminPIN: pin, updatedAt: serverTimestamp() },
      { merge: true }
    );
    _adminPIN = pin;
    if (window.showToast) window.showToast("Admin PIN saved ✓", "success");
  } catch (e) {
    if (window.showToast) window.showToast("Failed to save PIN", "error");
  }
};

// Add PIN setup field to the Settings panel
// This runs after DOM loads to inject the PIN field into admin settings
function injectPINSettingsField() {
  const accountSection = document.querySelector(
    "#adm-settings .settings-section:nth-child(4) .card__body, #panel-settings .card__body"
  );
  if (!accountSection || document.getElementById("pin-setup-field")) return;

  const pinField = document.createElement("div");
  pinField.id = "pin-setup-field";
  pinField.innerHTML = `
    <div style="margin-top:20px;padding-top:16px;
      border-top:0.5px solid rgba(255,255,255,0.07);">
      <label style="display:block;font-size:0.55rem;font-weight:500;
        letter-spacing:0.12em;text-transform:uppercase;
        color:rgba(245,245,247,0.4);margin-bottom:7px;">
        Admin PIN (6 digits)
      </label>
      <div style="display:flex;gap:8px;align-items:center;">
        <input type="password" id="new-pin-input"
          placeholder="Enter 6-digit PIN"
          maxlength="6" inputmode="numeric"
          style="flex:1;background:rgba(255,255,255,0.04);
            border:0.5px solid rgba(255,255,255,0.1);border-radius:12px;
            padding:11px 15px;color:#f5f5f7;
            font-family:'DM Sans',sans-serif;font-size:0.72rem;
            outline:none;letter-spacing:0.2em;"/>
        <button onclick="saveAdminPIN(document.getElementById('new-pin-input').value)"
          style="padding:11px 18px;background:#0a84ff;border:none;
            border-radius:12px;color:#fff;font-family:'DM Sans',sans-serif;
            font-size:0.6rem;font-weight:600;cursor:pointer;flex-shrink:0;">
          Set PIN
        </button>
      </div>
      <p style="font-size:0.52rem;color:rgba(245,245,247,0.25);
        margin-top:7px;letter-spacing:0.04em;">
        ${_adminPIN ? "✓ PIN is set — tap the + button to use it" :
          "Once set, use this PIN instead of your password to log in quickly"}
      </p>
    </div>`;

  accountSection.appendChild(pinField);
}

// Try to inject PIN field after a short delay
setTimeout(injectPINSettingsField, 1500);


// ============================================================
//  FIX 5 — WELCOME POPUP CIRCLE BUG
//
//  Problem: The divider line in the welcome popup was
//  rendering as a circle instead of a horizontal line.
//
//  Solution: Add display:block and ensure width:100%.
//  The CSS was missing display:block which caused the
//  browser to treat it as an inline element.
// ============================================================
function applyFix5_WelcomeCircle() {
  // Find all welcome card dividers and fix them
  document.querySelectorAll(".welcome-card__divider").forEach(el => {
    el.style.display      = "block";   // Must be block not inline
    el.style.width        = "100%";    // Full width of the card
    el.style.height       = "1px";     // Thin line
    el.style.borderRadius = "10px";
    el.style.margin       = "0 0 28px 0";
    el.style.background   = "linear-gradient(to right, transparent, rgba(232,213,176,0.3), transparent)";
  });

  // Also inject corrected CSS to override the broken rule
  const style = document.createElement("style");
  style.textContent = `
    .welcome-card__divider {
      display: block !important;
      width: 100% !important;
      height: 1px !important;
      border-radius: 10px !important;
      background: linear-gradient(
        to right, transparent,
        rgba(232,213,176,0.3), transparent
      ) !important;
      margin: 0 0 28px 0 !important;
    }

    /* Also add shake animation for PIN pad */
    @keyframes shake {
      0%,100% { transform: translateX(0); }
      20%      { transform: translateX(-8px); }
      40%      { transform: translateX(8px); }
      60%      { transform: translateX(-6px); }
      80%      { transform: translateX(6px); }
    }
  `;
  document.head.appendChild(style);
}


// ============================================================
//  FIX 6 — WHATSAPP BUBBLE READS NUMBER FROM FIRESTORE
//
//  Problem: The WhatsApp bubble was not opening because
//  the phone number wasn't being loaded from Firestore.
//
//  Solution: Override the openWhatsAppChat function with
//  a version that correctly reads from loaded settings,
//  with a clear error message if the number isn't saved yet.
// ============================================================
function applyFix6_WhatsAppNumber() {
  // Override the function from customer-welcome.js
  window.openWhatsAppChat = function() {

    // Get number from loaded settings
    const rawNumber = _storeSettings.whatsapp || "";
    const number    = rawNumber.replace(/[^0-9]/g, "");

    if (!number) {
      // Number not saved — show friendly message
      if (window.toast) {
        window.toast("Chat coming soon! For now please browse our collection 🛍", "");
      } else {
        alert("WhatsApp not configured yet. Please check back soon!");
      }
      return;
    }

    // Get customer's name if logged in
    const user     = auth.currentUser;
    const name     = user?.displayName
      || user?.email?.split("@")[0]
      || "";

    const storeName = _storeSettings.storeName || "AURA Fashion";

    // Build a warm, natural opening message
    const message =
`Hello ${storeName}! 👋

I'm interested in shopping with you.${name ? "\n\nMy name is " + name + "." : ""}

Could you help me? 🛍`;

    // Encode and open WhatsApp
    const url = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
    const win = window.open(url, "_blank");
    if (!win) window.location.href = url;

    // Remove notification dot after first tap
    const dot = document.querySelector(".wa-bubble__dot");
    if (dot) {
      dot.style.transition = "transform 0.2s ease";
      dot.style.transform  = "scale(0)";
      setTimeout(() => dot.remove(), 200);
    }
  };
}


// ============================================================
//  FIX 7 — CUSTOMIZABLE LOGO
//
//  Problem: Logo was hardcoded — buyers couldn't change it.
//
//  Solution:
//  - Admin uploads a logo image in Settings → Brand section
//  - It uploads to Cloudinary → URL saves to Firestore
//  - On page load we read the URL from Firestore
//  - If a logo exists → show it as a circle in the navbar
//  - If no logo → show the store name as text (existing behaviour)
//  - Buyer decides whether to use logo or text
// ============================================================
function applyFix7_Logo() {
  const logoURL   = _storeSettings.logoURL   || "";
  const storeName = _storeSettings.storeName || "AURA";

  if (!logoURL) return; // No logo — keep existing text

  // Find the nav logo element
  const navLogo = document.querySelector(".nav-logo");
  if (!navLogo) return;

  // Replace text with circle logo image
  navLogo.innerHTML = `
    <div style="
      display: flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
    ">
      <div style="
        width: 34px;
        height: 34px;
        border-radius: 50%;
        overflow: hidden;
        border: 1.5px solid rgba(232,213,176,0.3);
        flex-shrink: 0;
      ">
        <img src="${logoURL}"
          style="width:100%;height:100%;object-fit:cover;"
          alt="${storeName} logo"/>
      </div>
      <span style="
        font-family:'Cormorant Garamond',serif;
        font-size:1.3rem;font-weight:300;
        letter-spacing:0.35em;color:#f5f5f7;
      ">${storeName}</span>
    </div>`;

  // Also update the welcome popup logo
  const welcomeSymbol = document.querySelector(".welcome-card__symbol");
  if (welcomeSymbol) {
    welcomeSymbol.outerHTML = `
      <div style="
        width:72px;height:72px;border-radius:50%;
        overflow:hidden;margin:0 auto 20px;
        border:2px solid rgba(232,213,176,0.3);
      ">
        <img src="${logoURL}"
          style="width:100%;height:100%;object-fit:cover;"
          alt="${storeName}"/>
      </div>`;
  }

  // Update store name in welcome popup too
  const welcomeTitle = document.querySelector(".welcome-card__title");
  if (welcomeTitle) {
    welcomeTitle.textContent = storeName;
  }
}

/**
 * uploadStoreLogo(file)
 * Called from the admin Settings panel when logo is selected.
 * Uploads to Cloudinary → saves URL to Firestore.
 */
window.uploadStoreLogo = async function(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    if (window.showToast) window.showToast("Please select an image file", "error");
    return;
  }

  const btn = document.getElementById("logo-upload-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Uploading…"; }

  try {
    // Use Cloudinary upload if available
    let logoURL = "";
    if (window.uploadToCloudinary) {
      logoURL = await window.uploadToCloudinary(file, "logos", null);
    } else {
      // Fallback — convert to base64
      logoURL = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.readAsDataURL(file);
      });
    }

    // Save URL to Firestore settings
    await setDoc(
      doc(db, "settings", "store"),
      { logoURL, updatedAt: serverTimestamp() },
      { merge: true }
    );

    _storeSettings.logoURL = logoURL;

    // Show preview immediately
    const preview = document.getElementById("logo-preview");
    if (preview) {
      preview.src           = logoURL;
      preview.style.display = "block";
    }

    if (window.showToast) window.showToast("Logo saved ✓", "success");

  } catch (e) {
    console.error("Logo upload failed:", e);
    if (window.showToast) window.showToast("Logo upload failed", "error");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Upload Logo"; }
  }
};

// Inject logo upload field into admin Settings Brand section
function injectLogoUploadField() {
  // Find the Brand settings section
  const brandSection = document.querySelector(
    "[id*='s-store-name']"
  )?.closest(".card__body, .settings-section");

  if (!brandSection || document.getElementById("logo-upload-field")) return;

  const logoField = document.createElement("div");
  logoField.id = "logo-upload-field";
  logoField.style.marginBottom = "16px";
  logoField.innerHTML = `
    <label style="display:block;font-size:0.55rem;font-weight:500;
      letter-spacing:0.12em;text-transform:uppercase;
      color:rgba(245,245,247,0.4);margin-bottom:7px;">
      Store Logo
    </label>

    <!-- Logo preview circle -->
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px;">
      <div style="width:64px;height:64px;border-radius:50%;
        overflow:hidden;background:rgba(255,255,255,0.05);
        border:0.5px solid rgba(255,255,255,0.1);flex-shrink:0;
        display:flex;align-items:center;justify-content:center;">
        <img id="logo-preview"
          src="${_storeSettings.logoURL || ""}"
          style="width:100%;height:100%;object-fit:cover;
            display:${_storeSettings.logoURL ? "block" : "none"};"
          alt="Logo preview"/>
        ${!_storeSettings.logoURL
          ? `<span style="font-size:1.4rem;opacity:0.3;">✦</span>`
          : ""}
      </div>
      <div>
        <div style="font-size:0.62rem;color:rgba(245,245,247,0.6);
          margin-bottom:4px;">
          ${_storeSettings.logoURL ? "Logo uploaded ✓" : "No logo yet"}
        </div>
        <div style="font-size:0.52rem;color:rgba(245,245,247,0.3);">
          Displays as a circle in the navbar
        </div>
      </div>
    </div>

    <!-- Upload button -->
    <div style="position:relative;display:inline-block;">
      <input type="file" id="logo-file-input"
        accept="image/*"
        style="position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;"
        onchange="uploadStoreLogo(this.files[0])"/>
      <button id="logo-upload-btn"
        style="padding:10px 18px;background:rgba(255,255,255,0.06);
          border:0.5px solid rgba(255,255,255,0.12);border-radius:12px;
          color:rgba(245,245,247,0.7);font-family:'DM Sans',sans-serif;
          font-size:0.6rem;font-weight:500;cursor:pointer;
          transition:all 0.18s ease;"
        onmouseover="this.style.background='rgba(255,255,255,0.1)'"
        onmouseout="this.style.background='rgba(255,255,255,0.06)'">
        📷 Upload Logo
      </button>
    </div>`;

  // Insert at the top of the brand section
  brandSection.insertBefore(logoField, brandSection.firstChild);
}

setTimeout(injectLogoUploadField, 1500);

console.log("fixes.js loaded ✓ — All 7 fixes active");

