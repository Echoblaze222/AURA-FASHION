// ============================================================
//  AURA FASHION — admin-logic.js
//  Stage 3: Logic & Functionality
//
//  HOW TO USE:
//  Add this ONE line just before </body> in admin-dashboard.html:
//  <script type="module" src="admin-logic.js"></script>
//
//  This file handles:
//   1. saveProduct()      — uploads image → saves to Firestore (no double-post)
//   2. sendToWhatsApp()   — uploads screenshot → builds WhatsApp link
//   3. loadSettings()     — pulls bank/store info from Firestore on page load
//   4. savePaymentDetails()— saves bank account info to Firestore
//   5. loadDashboard()    — populates all stats and order lists from Firestore
//   6. updateOrderStatus()— changes an order's status in Firestore
//
//  UNDERSTANDING ASYNC / AWAIT (read this first!):
//  ─────────────────────────────────────────────────
//  JavaScript normally runs one line at a time, very fast.
//  But some things take TIME — like uploading a file or reading
//  a database. We can't just move to the next line while waiting.
//
//  "async" before a function means: "this function will wait for things"
//  "await" before a line means: "PAUSE HERE until this finishes, THEN continue"
//
//  Think of it like ordering food:
//    await uploadImage()  ← "wait here until image is uploaded"
//    await saveToFirestore() ← "NOW save to database (we have the URL)"
//
//  Without await, both would start at the same time and the
//  database save would happen before the upload finished — BROKEN.
// ============================================================


// ── STEP 1: IMPORT EVERYTHING WE NEED ───────────────────────
// We import from firebase.js (Stage 1) so we reuse the same
// initialized Firebase connection — we don't start a new one.

import { auth, db, storage } from "./firebase.js";

// Firestore functions — for reading and writing to the database
import {
  collection,      // Points to a collection (like a folder of documents)
  doc,             // Points to a specific document inside a collection
  addDoc,          // Adds a NEW document with an auto-generated ID
  setDoc,          // Sets a document at a specific ID (creates or overwrites)
  getDoc,          // Reads ONE document from Firestore
  getDocs,         // Reads ALL documents from a collection
  updateDoc,       // Updates specific fields in an existing document
  deleteDoc,       // Deletes a document
  query,           // Builds a database query (like a filtered search)
  orderBy,         // Sorts query results
  onSnapshot,      // Listens for LIVE changes (auto-updates when data changes)
  serverTimestamp, // Records the exact server time (better than local Date())
  where            // Filters query results (like SQL WHERE clause)
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Firebase Storage functions — for uploading/downloading files
import {
  ref,             // Creates a "pointer" to a location in Storage
  uploadBytesResumable, // Uploads a file WITH a progress tracker
  getDownloadURL,  // Gets the public URL after a file is uploaded
  deleteObject     // Deletes a file from Storage
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// Auth state watcher — to know who is logged in
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";


// ── STEP 2: APP STATE ────────────────────────────────────────
// These variables live in memory while the dashboard is open.
// They reset if the page is refreshed.

let currentAdmin  = null;  // The logged-in admin Firebase user object
let allProducts   = [];    // Local cache of products from Firestore
let allOrders     = [];    // Local cache of orders from Firestore
let storeSettings = {};    // Local cache of settings from Firestore
let isSaving      = false; // GUARD FLAG — prevents double-posting (see saveProduct)


// ── STEP 3: WAIT FOR AUTH BEFORE DOING ANYTHING ─────────────
// We can't load data until we know WHO is logged in.
// onAuthStateChanged fires automatically when:
//   - The page loads (Firebase checks saved session)
//   - Someone logs in
//   - Someone logs out

onAuthStateChanged(auth, (user) => {
  if (user) {
    // ── Admin is logged in ──────────────────────────────────
    currentAdmin = user;
    console.log("Admin confirmed:", user.email);

    // Now that we know the admin is real, load all the data.
    // We call these in order — settings first, then the rest.
    initDashboard();

  } else {
    // ── Nobody logged in — redirect to login ────────────────
    // This is the security guard. If someone navigates directly
    // to admin-dashboard.html without logging in, this kicks them out.
    console.warn("No admin session — redirecting to login.");
    window.location.href = "index.html";
  }
});


// ============================================================
//  FUNCTION: initDashboard()
//
//  The "startup sequence" — runs once when admin logs in.
//  Loads settings, then products, then orders, then stats.
//  Called from the onAuthStateChanged listener above.
// ============================================================
async function initDashboard() {
  try {
    // Load in sequence — each awaits the previous to finish
    // before starting, so nothing is missing when we render

    await loadSettings();   // Load bank info, store name, WhatsApp number
    await loadProducts();   // Load all products for the Products panel
    await loadOrders();     // Load all orders for the Orders panel
    renderDashboardStats(); // Calculate and display analytics bars

    console.log("Dashboard ready ✓");

  } catch (error) {
    console.error("Dashboard init failed:", error);
    showToast("Failed to load dashboard data — check your connection", "error");
  }
}


// ============================================================
//  FUNCTION 1: saveProduct()
//
//  The full "Add Product" workflow:
//    Step A → Validate the form
//    Step B → Disable button IMMEDIATELY (prevents double-click)
//    Step C → Upload image to Firebase Storage (async — we wait)
//    Step D → Get the public download URL (async — we wait)
//    Step E → Save all product data + image URL to Firestore
//    Step F → Show success, redirect to products panel
//
//  WHY THIS ORDER MATTERS:
//  We MUST upload the image BEFORE saving to Firestore.
//  If we saved first, the Firestore document would have no image URL.
//  "await" makes JavaScript WAIT at each step before moving on.
// ============================================================
window.saveProduct = async function() {

  // ── GUARD: prevent double-click / double-post ─────────────
  // If isSaving is already true (button was already clicked),
  // we stop immediately. Without this, clicking fast would
  // create duplicate products in Firestore.
  if (isSaving) {
    console.log("Already saving — ignoring extra click.");
    return;
  }

  // ── STEP A: Read values from the form ─────────────────────
  const nameInput     = document.getElementById("product-name");
  const priceInput    = document.getElementById("product-price");
  const categoryInput = document.getElementById("product-category");
  const descInput     = document.getElementById("product-desc");
  const stockInput    = document.getElementById("product-stock");
  const discountInput = document.getElementById("product-discount");
  const imgInput      = document.getElementById("product-img-input");

  // .trim() removes accidental spaces from the start and end
  const name     = nameInput?.value.trim()     || "";
  const price    = priceInput?.value.trim()    || "";
  const category = categoryInput?.value.trim() || "clothes";
  const desc     = descInput?.value.trim()     || "";
  const stock    = stockInput?.value.trim()    || "0";
  const discount = discountInput?.value.trim() || "0";

  // Get the sizes that were selected (chips with data-selected="true")
  const selectedSizes = [...document.querySelectorAll(".size-chip[data-selected='true']")]
    .map(chip => chip.textContent.trim())
    .join(", ");

  // The file the admin selected in the image picker
  // imgInput.files is a list — [0] gets the first (and only) file
  const imageFile = imgInput?.files[0] || null;

  // ── STEP A2: Validate required fields ─────────────────────
  // Don't bother with Firebase if basic info is missing
  if (!name) {
    showToast("Product name is required", "error");
    nameInput?.focus();
    return;
  }
  if (!price || isNaN(parseFloat(price))) {
    showToast("Please enter a valid price", "error");
    priceInput?.focus();
    return;
  }

  // ── STEP B: LOCK THE BUTTON IMMEDIATELY ───────────────────
  // This is the fix for double-posting.
  // We do this BEFORE any async work, so even if the user
  // clicks again in the milliseconds while the upload starts,
  // the guard flag (isSaving) stops it.
  isSaving = true;
  const saveBtn = document.getElementById("save-product-btn");
  const originalBtnHTML = saveBtn.innerHTML; // Save original text to restore later
  saveBtn.disabled  = true;
  saveBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 0.7s linear infinite;">
      <path d="M21 12a9 9 0 11-6.219-8.56"/>
    </svg>
    Uploading…
  `;

  // Add the spin animation to the page if not already there
  if (!document.getElementById("spin-style")) {
    const style = document.createElement("style");
    style.id = "spin-style";
    style.textContent = "@keyframes spin { to { transform: rotate(360deg); } }";
    document.head.appendChild(style);
  }

  try {

    // ── STEP C: Upload image to Firebase Storage ─────────────
    // We only do this if the admin actually selected an image.
    // If no image, we use an empty string for the URL.
    let imageURL = "";

    if (imageFile) {

      // Update button text to show progress stage
      saveBtn.innerHTML = saveBtn.innerHTML.replace("Uploading…", "Uploading image…");

      // ref() creates a POINTER to where the file will live in Storage.
      // The path is: products/{timestamp}-{filename}
      // Using timestamp in the name prevents name collisions (two products
      // with the same image filename won't overwrite each other).
      const timestamp    = Date.now(); // Current time as a number e.g. 1719123456789
      const safeFileName = imageFile.name.replace(/[^a-zA-Z0-9._-]/g, "_"); // Clean filename
      const storagePath  = `products/${timestamp}-${safeFileName}`;
      const imageRef     = ref(storage, storagePath);

      // uploadBytesResumable uploads the file AND gives us a progress tracker.
      // This is better than uploadBytes() because we can show a progress bar.
      const uploadTask = uploadBytesResumable(imageRef, imageFile);

      // ── WAIT for the upload to finish ───────────────────────
      // This is a Promise — JavaScript will "await" here until
      // the upload is 100% complete before moving to the next line.
      // While waiting, the progress callback updates the UI.
      imageURL = await new Promise((resolve, reject) => {

        uploadTask.on(
          "state_changed",

          // Progress callback — fires every time a chunk uploads
          (snapshot) => {
            // snapshot.bytesTransferred = how many bytes have uploaded so far
            // snapshot.totalBytes       = total size of the file
            // Dividing gives us a number between 0 and 1 (e.g. 0.45 = 45%)
            const progress = Math.round(
              (snapshot.bytesTransferred / snapshot.totalBytes) * 100
            );

            // Update the button text to show live progress
            saveBtn.innerHTML = saveBtn.innerHTML.replace(
              /\d+%/,
              progress + "%"
            ) || `Uploading… ${progress}%`;

            // Update the progress bar in the UI (if it exists on the page)
            const bar = document.getElementById("upload-progress-bar");
            if (bar) bar.style.width = progress + "%";

            console.log(`Upload progress: ${progress}%`);
          },

          // Error callback — fires if the upload fails
          (error) => {
            console.error("Upload failed:", error.code);
            reject(error); // Reject the Promise — jumps to the catch block below
          },

          // Success callback — fires when upload is 100% complete
          async () => {
            // getDownloadURL() asks Firebase for the public URL of the file.
            // This URL never expires and can be embedded in <img> tags anywhere.
            // "await" pauses here until Firebase confirms the URL.
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            console.log("Image uploaded. Public URL:", url);
            resolve(url); // Resolve the Promise — continues past the "await" above
          }
        );
      });

    }// end if(imageFile)


    // ── STEP D: Build the product data object ─────────────────
    // At this point, imageURL either contains the Firebase Storage
    // URL, or an empty string if no image was uploaded.
    // We now have EVERYTHING needed to save the product.

    saveBtn.innerHTML = saveBtn.innerHTML.replace(/Uploading.*/, "Saving product…");

    const productData = {
      name:        name,
      price:       parseFloat(price),  // Store as a number, not a string
      category:    category,
      description: desc,
      stock:       parseInt(stock) || 0,
      discount:    parseInt(discount) || 0,
      sizes:       selectedSizes,
      imageURL:    imageURL,            // The Firebase Storage URL from Step C
      hidden:      false,               // Visible to customers by default
      createdAt:   serverTimestamp(),   // Firebase records the exact server time
      createdBy:   currentAdmin.email,  // Which admin created this product
    };


    // ── STEP E: Save to Firestore ──────────────────────────────
    // collection(db, "products") points to the "products" collection.
    // addDoc() creates a new document WITH AN AUTO-GENERATED ID.
    //   (We don't choose the ID — Firebase generates a unique one like "abc123xyz")
    // "await" pauses HERE until Firestore confirms the document was saved.
    // If there's no internet, this will throw an error (caught below).
    const docRef = await addDoc(collection(db, "products"), productData);

    console.log("Product saved to Firestore with ID:", docRef.id);

    // Add the new product to our local cache so the UI updates instantly
    // without needing to re-fetch everything from Firestore
    allProducts.unshift({ id: docRef.id, ...productData });


    // ── STEP F: Success! ────────────────────────────────────────
    showToast("Product saved ✓", "success");

    // Reset the form so admin can add another product
    resetProductForm();

    // Redirect back to the overview panel after a short delay
    // The delay lets the admin see the success toast first
    setTimeout(() => {
      showPanel("overview");
      renderDashboardStats(); // Refresh stats to include new product
    }, 1200);


  } catch (error) {
    // ── STEP ERROR: Something went wrong ────────────────────────
    // This catches ANY error from Step C or Step E:
    //   - Upload failed (no internet, storage rules blocked it)
    //   - Firestore save failed (permissions error, offline)
    console.error("saveProduct failed:", error.code, error.message);

    // Show a friendly error message
    const friendlyMsg = getStorageErrorMessage(error.code);
    showToast(friendlyMsg, "error");

  } finally {
    // ── ALWAYS runs, whether save succeeded or failed ──────────
    // "finally" means: "no matter what happened above, always do this."
    //
    // We MUST re-enable the button here. If we only did it in the
    // success block, a failed save would leave the button disabled forever.
    isSaving          = false;
    saveBtn.disabled  = false;
    saveBtn.innerHTML = originalBtnHTML;

    // Hide the progress bar
    const bar = document.getElementById("upload-progress-bar");
    if (bar) bar.style.width = "0%";
  }
};


// ============================================================
//  FUNCTION 2: sendToWhatsApp(orderDetails, screenshotFile)
//
//  The WhatsApp order workflow:
//    Step A → Upload screenshot to Firebase Storage (async — we wait)
//    Step B → Get the public download URL
//    Step C → Build the WhatsApp message with the URL embedded
//    Step D → Use encodeURIComponent to make the URL safe
//    Step E → Open WhatsApp in a new tab
//
//  WHY ENCODE THE MESSAGE?
//  URLs can only contain certain characters. Spaces, colons,
//  and special characters break URLs. encodeURIComponent()
//  converts them to safe versions:
//    space → %20
//    :     → %3A
//    /     → %2F
//  So "Hello World" becomes "Hello%20World" in the URL.
//
//  Parameters:
//    orderDetails   — object with name, phone, items, total, orderId
//    screenshotFile — the File object from <input type="file">
// ============================================================
window.sendToWhatsApp = async function(orderDetails, screenshotFile) {

  // Get the admin's WhatsApp number from settings
  // Remove everything except digits (strips +, spaces, dashes)
  const whatsappRaw    = storeSettings.whatsapp || "";
  const whatsappNumber = whatsappRaw.replace(/[^0-9]/g, "");

  if (!whatsappNumber) {
    showToast("WhatsApp number not set — go to Wallet → Settings", "error");
    return;
  }

  // Show loading state on the send button
  const sendBtn = document.getElementById("send-whatsapp-btn");
  if (sendBtn) {
    sendBtn.disabled   = true;
    sendBtn.textContent = "Uploading proof…";
  }

  try {

    // ── STEP A: Upload the screenshot to Firebase Storage ──────
    // We store screenshots separately from products:
    //   Path: screenshots/{orderId}/{timestamp}.jpg
    //
    // This gives us a permanent, shareable link to the image
    // that the admin can open directly from WhatsApp.
    let screenshotURL = "";

    if (screenshotFile) {

      // Build the storage path using the order ID as a folder
      // This keeps all screenshots for one order together
      const orderId     = orderDetails.orderId || "ORD-" + Date.now();
      const timestamp   = Date.now();
      const safeFile    = screenshotFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `screenshots/${orderId}/${timestamp}-${safeFile}`;
      const ssRef       = ref(storage, storagePath);

      // Upload the file.
      // Unlike products, we use uploadBytesResumable here too for consistency.
      const uploadTask = uploadBytesResumable(ssRef, screenshotFile);

      // ── WAIT for screenshot upload to complete ─────────────
      screenshotURL = await new Promise((resolve, reject) => {
        uploadTask.on(
          "state_changed",

          // Progress — update button text
          (snapshot) => {
            const pct = Math.round(
              (snapshot.bytesTransferred / snapshot.totalBytes) * 100
            );
            if (sendBtn) sendBtn.textContent = `Uploading… ${pct}%`;
          },

          // Upload failed
          (error) => {
            console.error("Screenshot upload failed:", error);
            reject(error);
          },

          // Upload 100% complete — get the public URL
          async () => {
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            console.log("Screenshot uploaded. URL:", url);
            resolve(url);
          }
        );
      });

    }// end if(screenshotFile)


    // ── STEP B: Save the order to Firestore ───────────────────
    // We save the order AFTER the screenshot uploads so we can
    // store the screenshot URL directly in the order document.
    const orderData = {
      orderId:       orderDetails.orderId       || "ORD-" + Date.now(),
      customerName:  orderDetails.customerName  || "",
      customerPhone: orderDetails.customerPhone || "",
      customerEmail: orderDetails.customerEmail || "",
      address:       orderDetails.address       || "",
      city:          orderDetails.city          || "",
      country:       orderDetails.country       || "",
      items:         orderDetails.items         || [],
      total:         orderDetails.total         || 0,
      totalFormatted:orderDetails.totalFormatted|| "",
      currency:      orderDetails.currency      || "USD",
      screenshotURL: screenshotURL,  // The Firebase Storage URL from above
      status:        "pending",      // All orders start as pending
      createdAt:     serverTimestamp(),
      notes:         orderDetails.notes || "",
    };

    // Save to Firestore — "await" waits for confirmation before continuing
    await setDoc(
      doc(db, "orders", orderData.orderId), // Use order ID as the document ID
      orderData
    );

    console.log("Order saved to Firestore:", orderData.orderId);

    // Add to local cache
    allOrders.unshift(orderData);


    // ── STEP C: Build the WhatsApp message ────────────────────
    // We build a clear, readable message that includes:
    //   - A greeting
    //   - Order ID
    //   - Customer details
    //   - Items ordered
    //   - Total
    //   - The screenshot URL (so admin can tap and open it)

    // Build a readable list of items
    const itemsList = (orderDetails.items || [])
      .map(item => `  • ${item.name} ×${item.qty}${item.size ? " (" + item.size + ")" : ""}`)
      .join("\n");

    // The raw message — plain text with line breaks (\n)
    const rawMessage =
`Hello AURA Fashion,

I have made a payment for my order. Please find my details below:

🧾 ORDER DETAILS
Order ID: ${orderData.orderId}
Date: ${new Date().toLocaleDateString("en-GB")}

👤 MY DETAILS
Name: ${orderData.customerName}
Phone: ${orderData.customerPhone}
Email: ${orderData.customerEmail || "—"}
Address: ${orderData.address}, ${orderData.city}, ${orderData.country}
${orderData.notes ? "Notes: " + orderData.notes : ""}

🛒 ITEMS ORDERED
${itemsList}

💰 TOTAL: ${orderData.totalFormatted}

📸 PROOF OF PAYMENT:
${screenshotURL || "Screenshot not attached"}

Thank you!`;


    // ── STEP D: Encode the message ─────────────────────────────
    // encodeURIComponent() converts the entire message into a
    // URL-safe string. This is CRITICAL — without it, the link
    // breaks as soon as it hits a space, colon, or slash.
    //
    // Example of what it does:
    //   "Hello World" → "Hello%20World"
    //   "Order: #123" → "Order%3A%20%23123"
    //   "https://..." → "https%3A%2F%2F..."
    const encodedMessage = encodeURIComponent(rawMessage);


    // ── STEP E: Build the WhatsApp URL and open it ─────────────
    // wa.me is WhatsApp's official link format:
    //   https://wa.me/{phone}?text={encoded_message}
    //
    // {phone} must be in international format with NO + sign:
    //   +2348012345678 → 2348012345678
    //
    // window.open() opens the link in a new browser tab.
    // On mobile, it opens the WhatsApp app directly.
    const whatsappURL = `https://wa.me/${whatsappNumber}?text=${encodedMessage}`;

    console.log("Opening WhatsApp:", whatsappURL.substring(0, 80) + "…");

    // Open WhatsApp — null = new tab, "_blank" = new tab
    const newWindow = window.open(whatsappURL, "_blank");

    // Some browsers block window.open() — fallback to redirect
    if (!newWindow) {
      window.location.href = whatsappURL;
    }

    // Show success message
    showToast("WhatsApp opened with your order details ✓", "success");

    // Redirect to success page
    setTimeout(() => {
      showPanel("overview");
    }, 1500);


  } catch (error) {
    console.error("sendToWhatsApp failed:", error);
    showToast("Failed to send order — " + (error.message || "please try again"), "error");

  } finally {
    // Always re-enable the send button
    if (sendBtn) {
      sendBtn.disabled   = false;
      sendBtn.textContent = "📤 Send via WhatsApp";
    }
  }
};


// ============================================================
//  FUNCTION 3: loadSettings()
//
//  Reads the store's settings from Firestore and:
//   - Updates the storeSettings object in memory
//   - Fills in the form fields in the Settings panel
//   - Updates the bank card display in the Wallet panel
//
//  Settings are stored at: /settings/store  (one document)
//  We use a fixed ID "store" so there's always exactly one
//  settings document — not a new one every time.
// ============================================================
async function loadSettings() {
  try {
    // doc(db, "settings", "store") points to:
    //   Collection: "settings"
    //   Document ID: "store"  ← fixed ID, always the same document
    const settingsRef = doc(db, "settings", "store");

    // getDoc() fetches the document from Firestore.
    // "await" pauses here until the database responds.
    const settingsSnap = await getDoc(settingsRef);

    if (settingsSnap.exists()) {
      // .data() returns all the fields as a plain JavaScript object
      storeSettings = settingsSnap.data();
      console.log("Settings loaded:", Object.keys(storeSettings));

      // Now fill in all the form fields with the saved values
      populateSettingsForms();
      populateWalletDisplay();

    } else {
      // No settings document exists yet — this is a new store
      console.log("No settings found — admin needs to configure the store.");
      storeSettings = {}; // Empty object, forms will be blank
    }

  } catch (error) {
    console.error("loadSettings failed:", error);
    // Non-fatal — dashboard can still work without settings
  }
}

// Fills the Settings panel form fields with saved values
function populateSettingsForms() {
  // Helper: sets an input's value safely (does nothing if element missing)
  const setVal = (id, value) => {
    const el = document.getElementById(id);
    if (el && value !== undefined) el.value = value;
  };

  // Brand section
  setVal("s-store-name",    storeSettings.storeName    || "");
  setVal("s-bio",           storeSettings.bio          || "");

  // Contact section
  setVal("s-whatsapp",      storeSettings.whatsapp     || "");
  setVal("s-contact-email", storeSettings.contactEmail || "");

  // Admin account section
  setVal("s-adm-email",     storeSettings.adminEmail   || "");

  // Wallet / Bank section
  setVal("w-bank-name",     storeSettings.bankName     || "");
  setVal("w-acc-name",      storeSettings.accName      || "");
  setVal("w-acc-num",       storeSettings.accNumber    || "");
  setVal("w-pay-link",      storeSettings.payLink      || "");
}

// Updates the visual bank card display in the Wallet panel
function populateWalletDisplay() {
  const setTxt = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value || "—";
  };

  setTxt("wallet-bank-name", storeSettings.bankName  || "Not set");
  setTxt("wallet-acc-name",  storeSettings.accName   || "Not set");
  setTxt("wallet-acc-num",   storeSettings.accNumber || "Not set");

  const linkEl = document.getElementById("wallet-pay-link");
  if (linkEl) {
    if (storeSettings.payLink) {
      linkEl.textContent = storeSettings.payLink;
      linkEl.href = storeSettings.payLink;
    } else {
      linkEl.textContent = "Not set";
    }
  }

  // Update copy button to copy the real account number
  const copyBtn = document.querySelector(".copy-btn");
  if (copyBtn && storeSettings.accNumber) {
    copyBtn.onclick = () => copyText(storeSettings.accNumber, "Account number copied ✓");
  }
}


// ============================================================
//  FUNCTION 4: savePaymentDetails()
//
//  Saves bank account info to Firestore at /settings/store.
//
//  We use setDoc with { merge: true } which means:
//   "Update only the fields I specify — leave all others alone."
//  This is important because the settings document also has
//  storeName, bio, whatsapp etc. We don't want to erase those
//  just because we're saving bank details.
// ============================================================
window.savePaymentDetails = async function() {
  // Read values from the Wallet panel form
  const bankName  = document.getElementById("w-bank-name")?.value.trim() || "";
  const accName   = document.getElementById("w-acc-name")?.value.trim()  || "";
  const accNumber = document.getElementById("w-acc-num")?.value.trim()   || "";
  const payLink   = document.getElementById("w-pay-link")?.value.trim()  || "";

  // Basic validation
  if (!bankName || !accName || !accNumber) {
    showToast("Bank name, account name and number are required", "error");
    return;
  }

  // Validate account number — must be digits only
  if (!/^\d{8,20}$/.test(accNumber)) {
    showToast("Account number must be 8–20 digits", "error");
    return;
  }

  // Disable the save button
  const saveBtn = document.getElementById("save-payment-btn") ||
                  document.querySelector("[onclick='savePaymentDetails()']");
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving…"; }

  try {
    // setDoc with merge:true updates ONLY these fields in the document.
    // Any other fields in /settings/store are untouched.
    // "await" pauses until Firestore confirms the write.
    await setDoc(
      doc(db, "settings", "store"),  // Path: /settings/store
      {
        bankName:  bankName,
        accName:   accName,
        accNumber: accNumber,
        payLink:   payLink,
        updatedAt: serverTimestamp(), // Record when settings were last changed
        updatedBy: currentAdmin?.email || "",
      },
      { merge: true } // CRITICAL: don't erase other settings fields!
    );

    // Update local cache so UI reflects changes without re-fetching
    storeSettings.bankName  = bankName;
    storeSettings.accName   = accName;
    storeSettings.accNumber = accNumber;
    storeSettings.payLink   = payLink;

    // Refresh the bank card display
    populateWalletDisplay();

    showToast("Payment details saved ✓", "success");
    console.log("Payment settings saved.");

  } catch (error) {
    console.error("savePaymentDetails failed:", error);
    showToast("Failed to save — check your connection", "error");

  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "Save Payment Details"; }
  }
};


// ============================================================
//  FUNCTION 5: saveSettingsSection(section)
//
//  Saves a specific section of settings (brand, contact, account).
//  Always uses merge:true so only the relevant fields update.
// ============================================================
window.saveSettingsSection = async function(section) {
  let dataToSave = {};

  if (section === "brand") {
    dataToSave = {
      storeName: document.getElementById("s-store-name")?.value.trim() || "",
      bio:       document.getElementById("s-bio")?.value.trim()        || "",
    };

  } else if (section === "contact") {
    const whatsapp = document.getElementById("s-whatsapp")?.value.trim() || "";
    // Validate WhatsApp number format
    if (whatsapp && !/^[\+]?[\d\s\-]{7,20}$/.test(whatsapp)) {
      showToast("Invalid WhatsApp number — include country code", "error");
      return;
    }
    dataToSave = {
      whatsapp:     whatsapp,
      contactEmail: document.getElementById("s-contact-email")?.value.trim() || "",
    };

  } else if (section === "account") {
    const currentPw = document.getElementById("s-curr-pw")?.value || "";
    const newEmail  = document.getElementById("s-adm-email")?.value.trim() || "";

    if (!currentPw) {
      showToast("Enter your current password to make changes", "error");
      return;
    }
    dataToSave = {
      adminEmail: newEmail,
    };
    // Note: actual Firebase Auth password change happens in Stage 4
    // For now we just save the email preference to settings
  }

  // Add metadata to every save
  dataToSave.updatedAt = serverTimestamp();
  dataToSave.updatedBy = currentAdmin?.email || "";

  try {
    await setDoc(doc(db, "settings", "store"), dataToSave, { merge: true });
    // Update local cache
    Object.assign(storeSettings, dataToSave);
    showToast("Saved ✓", "success");

  } catch (error) {
    console.error("saveSettingsSection failed:", error);
    showToast("Save failed — check your connection", "error");
  }
};


// ============================================================
//  FUNCTION 6: loadProducts()
//
//  Reads all products from Firestore and renders them
//  in the Products panel.
// ============================================================
async function loadProducts() {
  try {
    // getDocs() fetches ALL documents from a collection at once.
    // For real-time updates, we'd use onSnapshot() instead —
    // but getDocs() is simpler and fine for an admin dashboard.
    const productsSnap = await getDocs(
      query(
        collection(db, "products"),
        orderBy("createdAt", "desc")  // Newest first
      )
    );

    // Convert the snapshot into a plain array we can work with
    allProducts = [];
    productsSnap.forEach(docSnap => {
      allProducts.push({ id: docSnap.id, ...docSnap.data() });
    });

    console.log(`Loaded ${allProducts.length} products.`);

    // Render the products in the dashboard
    renderProductsList();

  } catch (error) {
    console.error("loadProducts failed:", error);
    // If orderBy fails (index not created yet), try without sorting
    try {
      const fallbackSnap = await getDocs(collection(db, "products"));
      allProducts = [];
      fallbackSnap.forEach(d => allProducts.push({ id: d.id, ...d.data() }));
      renderProductsList();
    } catch (e) {
      console.error("Products fallback also failed:", e);
    }
  }
}

// Renders the products list in the admin Products panel
function renderProductsList() {
  const container = document.getElementById("adm-prod-list");
  if (!container) return;

  if (!allProducts.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">📦</div>
        <div class="empty-state__title">No products yet</div>
        <div class="empty-state__sub">Tap the + button to add your first product.</div>
        <button class="btn-ghost" onclick="showPanel('add-product')" style="margin-top:16px;">
          Add Product
        </button>
      </div>`;
    return;
    window._stage3Products = allProducts;
    window.dispatchEvent(new CustomEvent("productsloaded", {detail: allProducts  } ))
  }

  container.innerHTML = allProducts.map(p => `
    <div class="card mb-16" style="display:grid;grid-template-columns:64px 1fr auto;gap:14px;padding:16px;align-items:center;">
      <div style="width:64px;height:64px;border-radius:10px;overflow:hidden;background:var(--black3);flex-shrink:0;">
        ${p.imageURL
          ? `<img src="${p.imageURL}" style="width:100%;height:100%;object-fit:cover;" alt="${p.name}" loading="lazy"/>`
          : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:1.5rem;opacity:0.3;">📦</div>`
        }
      </div>
      <div style="min-width:0;">
        <div style="font-size:var(--fs-body);font-weight:500;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.name}</div>
        <div style="font-size:var(--fs-micro);color:var(--white3);letter-spacing:0.06em;text-transform:uppercase;">${p.category}</div>
        <div style="font-size:var(--fs-small);color:var(--white2);margin-top:2px;">$${p.price?.toFixed(2)}${p.discount ? ` <span style="color:var(--green);font-size:0.5rem;">-${p.discount}%</span>` : ""}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;">
        <button class="btn-sm" onclick="editProduct('${p.id}')">Edit</button>
        <button class="btn-sm" style="color:var(--red);border-color:rgba(255,59,48,0.3);" onclick="deleteProduct('${p.id}')">Delete</button>
        <span class="badge ${parseInt(p.stock) === 0 ? 'badge--out' : parseInt(p.stock) <= 5 ? 'badge--low' : 'badge--confirmed'}" style="font-size:0.45rem;">
          ${parseInt(p.stock) === 0 ? "Out" : "Stk: " + p.stock}
        </span>
      </div>
    </div>
  `).join("");
}


// ============================================================
//  FUNCTION 7: loadOrders()
//
//  Reads all orders from Firestore and renders them.
// ============================================================
async function loadOrders() {
  try {
    const ordersSnap = await getDocs(
      query(collection(db, "orders"), orderBy("createdAt", "desc"))
    );

    allOrders = [];
    ordersSnap.forEach(d => allOrders.push({ id: d.id, ...d.data() }));
    console.log(`Loaded ${allOrders.length} orders.`);
    renderOrdersList(allOrders);

  } catch (error) {
    console.error("loadOrders failed:", error);
    try {
      const snap = await getDocs(collection(db, "orders"));
      allOrders = [];
      snap.forEach(d => allOrders.push({ id: d.id, ...d.data() }));
      renderOrdersList(allOrders);
    } catch(e) { console.error("Orders fallback failed:", e); }
  }
}

// Renders the orders list — filterable by status
function renderOrdersList(orders) {
  const container = document.getElementById("orders-list");
  const emptyState = document.getElementById("orders-empty");
  if (!container) return;

  if (!orders.length) {
    container.innerHTML = "";
    if (emptyState) emptyState.style.display = "block";
    return;
  }
  if (emptyState) emptyState.style.display = "none";

  container.innerHTML = orders.map(o => `
    <div class="card mb-16">
      <div class="card__body">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
          <div style="flex:1;min-width:0;">
            <p style="font-size:var(--fs-micro);letter-spacing:0.14em;text-transform:uppercase;color:var(--white3);margin-bottom:5px;">
              ${o.orderId || o.id} · ${o.createdAt?.toDate?.()?.toLocaleDateString("en-GB") || "—"}
            </p>
            <p style="font-size:var(--fs-body);font-weight:500;margin-bottom:4px;">${o.customerName || "—"}</p>
            <p style="font-size:var(--fs-small);color:var(--white3);line-height:1.6;">
              📞 ${o.customerPhone || "—"}<br>
              📍 ${o.city || "—"}, ${o.country || "—"}
            </p>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0;">
            <span style="font-family:'Cormorant Garamond',serif;font-size:1.1rem;">${o.totalFormatted || "$" + o.total}</span>
            <span class="badge badge--${o.status || 'pending'}">${o.status || "pending"}</span>
          </div>
        </div>

        <div style="margin-top:14px;display:flex;gap:8px;align-items:center;">
          <select
            style="flex:1;background:var(--black3);border:0.5px solid var(--white4);border-radius:var(--btn-radius);padding:9px 12px;color:var(--white);font-family:'DM Sans',sans-serif;font-size:var(--fs-small);outline:none;-webkit-appearance:none;"
            onchange="updateOrderStatus('${o.orderId || o.id}', this.value)"
          >
            <option value="pending"   ${o.status === "pending"   ? "selected" : ""}>Pending</option>
            <option value="confirmed" ${o.status === "confirmed" ? "selected" : ""}>Confirmed</option>
            <option value="shipped"   ${o.status === "shipped"   ? "selected" : ""}>Shipped</option>
          </select>
          ${o.screenshotURL ? `
            <button class="btn-sm" onclick="viewScreenshot('${o.screenshotURL}')">
              📸 Proof
            </button>
          ` : ""}
        </div>
      </div>
    </div>
  `).join("");
}


// ============================================================
//  FUNCTION 8: updateOrderStatus()
//
//  Changes an order's status in Firestore.
//  Also decrements product stock when confirmed.
// ============================================================
window.updateOrderStatus = async function(orderId, newStatus) {
  try {
    // updateDoc() only updates the fields you specify —
    // all other order data stays the same.
    // "await" pauses until Firestore confirms the update.
    await updateDoc(doc(db, "orders", orderId), {
      status:    newStatus,
      updatedAt: serverTimestamp(),
    });

    // Update local cache
    const order = allOrders.find(o => (o.orderId || o.id) === orderId);
    if (order) order.status = newStatus;

    showToast(`Order marked as ${newStatus} ✓`, "success");

    // If confirming payment, decrement stock for each item
    if (newStatus === "confirmed" && order?.items?.length) {
      await decrementStock(order.items);
    }

    // Refresh analytics since order statuses changed
    renderDashboardStats();

  } catch (error) {
    console.error("updateOrderStatus failed:", error);
    showToast("Failed to update status", "error");
  }
};

// Reduces stock count for each item in a confirmed order
async function decrementStock(items) {
  for (const item of items) {
    const product = allProducts.find(p => p.id === item.productId);
    if (!product || !product.stock) continue;

    const currentStock = parseInt(product.stock) || 0;
    const newStock     = Math.max(0, currentStock - (item.qty || 1));

    try {
      await updateDoc(doc(db, "products", product.id), { stock: newStock });
      product.stock = newStock; // Update local cache
      if (newStock <= 3) {
        showToast(`⚠ Low stock: ${product.name} has ${newStock} left`, "error");
      }
    } catch (e) {
      console.error("Stock decrement failed for", product.name, e);
    }
  }
}


// ============================================================
//  FUNCTION 9: renderDashboardStats()
//
//  Calculates analytics from local data and updates
//  all the progress bars and stat chips on the dashboard.
// ============================================================
function renderDashboardStats() {
  const totalProducts  = allProducts.length;
  const totalOrders    = allOrders.length;
  const pendingOrders  = allOrders.filter(o => o.status === "pending").length;
  const confirmedOrders= allOrders.filter(o => o.status === "confirmed").length;

  // Total revenue = sum of all confirmed order totals
  const totalRevenue = allOrders
    .filter(o => o.status === "confirmed" || o.status === "shipped")
    .reduce((sum, o) => sum + (parseFloat(o.total) || 0), 0);

  const avgOrder = confirmedOrders > 0
    ? (totalRevenue / confirmedOrders).toFixed(0)
    : 0;

  // Confirmation rate (how many orders get confirmed)
  const confirmRate = totalOrders > 0
    ? Math.round((confirmedOrders / totalOrders) * 100)
    : 0;

  // Items with stock > 0
  const inStockCount   = allProducts.filter(p => parseInt(p.stock) > 0).length;
  const inventoryHealth= totalProducts > 0
    ? Math.round((inStockCount / totalProducts) * 100)
    : 100;

  // ── Update the stat chips ─────────────────────────────────
  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setTxt("stat-products",  totalProducts);
  setTxt("stat-orders",    totalOrders);
  setTxt("stat-customers", countUniqueCustomers());

  // ── Update the progress bars ──────────────────────────────
  // We update both the displayed value AND the bar width
  const updateBar = (valueId, barClass, value, maxValue, displayText) => {
    const valueEl = document.getElementById(valueId);
    const barEl   = document.querySelector("." + barClass);
    const width   = maxValue > 0 ? Math.min(100, Math.round((value / maxValue) * 100)) : 0;

    if (valueEl) valueEl.textContent = displayText || value;
    if (barEl)   barEl.style.width   = width + "%";
  };

  updateBar("bar-total-orders",   "stat-bar__fill--green",  confirmedOrders, Math.max(totalOrders, 1), totalOrders.toString());
  updateBar("bar-confirm-rate",   "bar-confirm-fill",       confirmRate,     100, confirmRate + "%");
  updateBar("bar-avg-order",      "bar-avg-fill",           1,               1,   "$" + avgOrder);
  updateBar("bar-inventory",      "bar-inventory-fill",     inventoryHealth, 100, inventoryHealth + "%");

  // Revenue bar — formatted with currency symbol
  const revenueEl = document.getElementById("bar-monthly-sales");
  if (revenueEl) revenueEl.textContent = "$" + totalRevenue.toLocaleString();
}

// Count how many unique customers (by phone number) have ordered
function countUniqueCustomers() {
  const phones = new Set(allOrders.map(o => o.customerPhone).filter(Boolean));
  return phones.size;
}


// ============================================================
//  FUNCTION 10: deleteProduct(productId)
//
//  Deletes a product from Firestore and removes it from the list.
// ============================================================
window.deleteProduct = async function(productId) {
  // Confirm before deleting — destructive action
  if (!confirm("Delete this product permanently? This cannot be undone.")) return;

  try {
    await deleteDoc(doc(db, "products", productId));
    // Remove from local cache
    allProducts = allProducts.filter(p => p.id !== productId);
    renderProductsList();
    renderDashboardStats();
    showToast("Product deleted", "success");
  } catch (error) {
    console.error("deleteProduct failed:", error);
    showToast("Delete failed — check your connection", "error");
  }
};


// ============================================================
//  FUNCTION 11: editProduct(productId)
//
//  Pre-fills the Add Product form with existing product data
//  so the admin can update it.
// ============================================================
window.editProduct = async function(productId) {
  const product = allProducts.find(p => p.id === productId);
  if (!product) return;

  // Switch to the Add Product panel
  showPanel("add-product");

  // Change the title and button to reflect "edit" mode
  const title = document.querySelector("#panel-add-product .panel__title");
  if (title) title.textContent = "Edit Product";

  const saveBtn = document.getElementById("save-product-btn");
  if (saveBtn) saveBtn.innerHTML = "Save Changes";

  // Pre-fill form fields with existing values
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val ?? "";
  };

  setVal("product-name",     product.name);
  setVal("product-price",    product.price);
  setVal("product-category", product.category);
  setVal("product-desc",     product.description || product.desc || "");
  setVal("product-stock",    product.stock);
  setVal("product-discount", product.discount);

  // Show existing product image
  if (product.imageURL) {
    const preview = document.getElementById("product-img-preview");
    if (preview) {
      preview.src = product.imageURL;
      preview.style.display = "block";
    }
  }

  // Pre-select size chips
  if (product.sizes) {
    const selectedSizes = product.sizes.split(",").map(s => s.trim());
    document.querySelectorAll(".size-chip").forEach(chip => {
      if (selectedSizes.includes(chip.textContent.trim())) {
        chip.dataset.selected = "true";
        chip.style.background  = "var(--white)";
        chip.style.color       = "var(--black)";
        chip.style.borderColor = "var(--white)";
      }
    });
  }

  // Override saveProduct to update instead of create
  // We store the edit ID so saveProduct knows which document to update
  window._editingProductId = productId;
};


// ============================================================
//  FUNCTION 12: filterOrders(status)
//
//  Filters the orders list by status.
// ============================================================
window.filterOrders = function(status) {
  // Update active filter button styling
  document.querySelectorAll("#order-filters .btn-sm").forEach(btn => {
    btn.style.background   = "";
    btn.style.color        = "";
    btn.style.borderColor  = "";
  });
  const activeBtn = event?.target;
  if (activeBtn) {
    activeBtn.style.background  = "var(--white)";
    activeBtn.style.color       = "var(--black)";
    activeBtn.style.borderColor = "var(--white)";
  }

  // Filter and re-render
  const filtered = status === "all"
    ? allOrders
    : allOrders.filter(o => o.status === status);

  renderOrdersList(filtered);
};


// ============================================================
//  HELPER: viewScreenshot(url)
//
//  Opens a payment screenshot in a new tab so admin can verify.
// ============================================================
window.viewScreenshot = function(url) {
  window.open(url, "_blank");
};


// ============================================================
//  HELPER: resetProductForm()
//
//  Clears the Add Product form after a successful save.
// ============================================================
function resetProductForm() {
  const ids = [
    "product-name", "product-price", "product-desc",
    "product-stock", "product-discount"
  ];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  // Reset category to default
  const cat = document.getElementById("product-category");
  if (cat) cat.value = "clothes";

  // Reset image preview
  const preview = document.getElementById("product-img-preview");
  if (preview) { preview.src = ""; preview.style.display = "none"; }

  // Reset size chips
  document.querySelectorAll(".size-chip").forEach(chip => {
    chip.dataset.selected = "false";
    chip.style.background  = "";
    chip.style.color       = "";
    chip.style.borderColor = "";
  });

  // Reset edit mode
  window._editingProductId = null;

  const title = document.querySelector("#panel-add-product .panel__title");
  if (title) title.textContent = "Add Product";

  const saveBtn = document.getElementById("save-product-btn");
  if (saveBtn) saveBtn.innerHTML = `
    <i data-lucide="save" style="width:17px;height:17px;stroke-width:2;"></i>
    Save Product
  `;

  // Re-render Lucide icons (they get wiped when innerHTML changes)
  if (window.lucide) lucide.createIcons();
}


// ============================================================
//  HELPER: getStorageErrorMessage(code)
//
//  Translates Firebase Storage error codes to plain English.
// ============================================================
function getStorageErrorMessage(code) {
  const messages = {
    "storage/unauthorized":      "Permission denied — check Firebase Storage rules.",
    "storage/canceled":          "Upload was cancelled.",
    "storage/unknown":           "Unknown upload error — check your internet.",
    "storage/quota-exceeded":    "Storage quota exceeded — upgrade your Firebase plan.",
    "storage/unauthenticated":   "You must be logged in to upload files.",
    "permission-denied":         "Firestore permission denied — check Security Rules.",
    "unavailable":               "Database unavailable — check your internet connection.",
  };
  return messages[code] || "Something went wrong — please try again.";
}


// ============================================================
//  EXPOSE showPanel and showToast to window
//  (These are defined in admin-dashboard.html but we need them
//  here too — they're already on window so this just confirms)
// ============================================================
window.loadOrders   = loadOrders;
window.loadProducts = loadProducts;


// ============================================================
//  AUTO-REFRESH — reload data when admin switches to a panel
//  This ensures the Orders panel is always up-to-date.
// ============================================================
document.querySelectorAll("[data-panel]").forEach(btn => {
  btn.addEventListener("click", () => {
    const panel = btn.dataset.panel;
    if (panel === "orders")   loadOrders();
    if (panel === "analytics") renderDashboardStats();
  });
});

