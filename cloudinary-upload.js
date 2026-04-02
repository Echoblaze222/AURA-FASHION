// ============================================================
//  AURA FASHION — cloudinary-upload.js
//  Replaces Firebase Storage with Cloudinary (free, no card)
//
//  HOW TO ADD THIS FILE:
//  In admin-dashboard.html, just before </body>, add:
//  <script type="module" src="cloudinary-upload.js"></script>
//  Make sure it loads BEFORE admin-logic.js and admin-stage4.js
//
//  YOUR CLOUDINARY CREDENTIALS:
//  Cloud Name:    dq045stg3
//  API Key:       912998421911189
//  Upload Preset: Aura-product  (Unsigned mode ✓)
//
//  WHAT THIS FILE DOES:
//  - Replaces every Firebase Storage upload in the app
//  - Uploads product images to Cloudinary
//  - Uploads payment screenshots to Cloudinary
//  - Returns a permanent public URL for each upload
//  - Shows a real progress bar during upload
//  - Works completely free with no credit card
//
//  HOW CLOUDINARY UNSIGNED UPLOAD WORKS:
//  Normal uploads need a secret key (dangerous to expose in JS).
//  "Unsigned" upload presets skip that requirement — they allow
//  uploads without any secret, but you control which folder and
//  settings apply via the preset you configured in Cloudinary.
// ============================================================


// ── YOUR CLOUDINARY CONFIG ───────────────────────────────────
// These are safe to have in frontend code because:
//   - Cloud name and API key are not secret
//   - The upload preset is set to "Unsigned" so no secret needed
//   - The API Secret is NOT here — that stays on a server
const CLOUDINARY = {
  cloudName:    "dq045stg3",          // Your Cloudinary cloud name
  apiKey:       "912998421911189",     // Your API key (not secret)
  uploadPreset: "Aura-product",        // Your unsigned upload preset
  // The upload URL — Cloudinary's endpoint for image uploads
  // {cloudName} gets replaced with your actual cloud name below
  uploadURL:    "https://api.cloudinary.com/v1_1/dq045stg3/image/upload",
};


// ============================================================
//  MAIN FUNCTION: uploadToCloudinary(file, folder, onProgress)
//
//  This is the function that replaces fbUploadImage() from Stage 3.
//  Every place in the app that uploads an image now calls THIS
//  instead of Firebase Storage.
//
//  HOW THE UPLOAD WORKS STEP BY STEP:
//  1. We build a FormData object (like an HTML form submission)
//  2. We attach the image file and our upload preset
//  3. We send it to Cloudinary's API using XMLHttpRequest
//     (we use XMLHttpRequest instead of fetch because it supports
//      progress events — fetch does not)
//  4. Cloudinary processes the image and returns a JSON response
//  5. The response contains a "secure_url" — the permanent image URL
//  6. We return that URL so it can be saved in Firestore
//
//  @param {File}     file       - The image File object from <input type="file">
//  @param {string}   folder     - Subfolder in Cloudinary e.g. "products" or "screenshots"
//  @param {function} onProgress - Optional callback: receives 0-100 as upload progresses
//  @returns {Promise<string>}   - Resolves to the permanent public image URL
// ============================================================
export async function uploadToCloudinary(file, folder = "products", onProgress = null) {

  // ── Validate the file before doing anything ───────────────
  if (!file) {
    throw new Error("No file provided to upload.");
  }

  // Check it's actually an image
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files can be uploaded. Got: " + file.type);
  }

  // Max file size check — 10MB limit (Cloudinary free tier allows more,
  // but large images slow down the store for customers)
  const maxSizeMB = 10;
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    throw new Error(`Image is too large. Maximum size is ${maxSizeMB}MB.`);
  }

  // ── Build the FormData payload ────────────────────────────
  // FormData is like filling in an HTML form — each .append()
  // adds one field to the form submission.
  const formData = new FormData();

  // The actual image file
  formData.append("file", file);

  // Your upload preset — tells Cloudinary which settings to use
  // This is what makes the upload work without a secret key
  formData.append("upload_preset", CLOUDINARY.uploadPreset);

  // Organise images into subfolders by type
  // products/   ← product images
  // screenshots/ ← payment proof images
  formData.append("folder", "aura-fashion/" + folder);

  // Add a timestamp to make each filename unique
  // This prevents two products with the same filename overwriting each other
  const timestamp = Date.now();
  const cleanName  = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  formData.append("public_id", folder + "_" + timestamp + "_" + cleanName);


  // ── Upload using XMLHttpRequest (supports progress events) ─
  // We wrap the whole thing in a Promise so we can use "await" on it.
  // The Promise resolves when upload succeeds, rejects when it fails.
  return new Promise((resolve, reject) => {

    // Create the request object
    const xhr = new XMLHttpRequest();

    // ── Progress event ──────────────────────────────────────
    // xhr.upload.onprogress fires repeatedly as data is sent.
    // event.loaded = bytes sent so far
    // event.total  = total bytes to send
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        // Calculate percentage: sent ÷ total × 100
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent); // Call the progress callback with 0-100
        console.log(`Cloudinary upload: ${percent}%`);
      }
    };

    // ── Success handler ─────────────────────────────────────
    // xhr.onload fires when the server responds (even if it's an error response)
    xhr.onload = () => {
      if (xhr.status === 200) {
        // Parse the JSON response from Cloudinary
        // The response contains info about the uploaded image
        try {
          const response = JSON.parse(xhr.responseText);

          // secure_url is the HTTPS URL to the image
          // This URL is permanent — it never expires
          // It works in any <img> tag anywhere in the world
          const imageURL = response.secure_url;

          console.log("Cloudinary upload success:", imageURL);
          resolve(imageURL); // Return the URL to the caller

        } catch (parseError) {
          reject(new Error("Cloudinary returned an unreadable response."));
        }

      } else {
        // Cloudinary returned an error (e.g. 400 bad request, 401 unauthorized)
        let errorMessage = "Upload failed.";
        try {
          const errorResponse = JSON.parse(xhr.responseText);
          errorMessage = errorResponse.error?.message || errorMessage;
        } catch (e) { /* ignore parse errors */ }

        console.error("Cloudinary error:", xhr.status, errorMessage);
        reject(new Error(errorMessage));
      }
    };

    // ── Network error handler ───────────────────────────────
    // xhr.onerror fires if there's no internet or the request
    // couldn't reach Cloudinary at all
    xhr.onerror = () => {
      reject(new Error("Network error — check your internet connection."));
    };

    // ── Timeout handler ─────────────────────────────────────
    // If upload takes more than 60 seconds, cancel it
    xhr.timeout = 60000; // 60 seconds
    xhr.ontimeout = () => {
      reject(new Error("Upload timed out — check your internet and try again."));
    };

    // ── Open and send the request ───────────────────────────
    // "POST" sends data TO the server (as opposed to GET which reads)
    xhr.open("POST", CLOUDINARY.uploadURL, true); // true = asynchronous
    xhr.send(formData); // Send the FormData we built above
  });
}


// ============================================================
//  HELPER: uploadProductImage(file, onProgress)
//  Shortcut for uploading product images specifically.
//  Puts them in the "products" folder in Cloudinary.
// ============================================================
export async function uploadProductImage(file, onProgress) {
  return uploadToCloudinary(file, "products", onProgress);
}


// ============================================================
//  HELPER: uploadScreenshot(file, orderId, onProgress)
//  Shortcut for uploading payment screenshots.
//  Puts them in "screenshots/{orderId}" folder in Cloudinary.
// ============================================================
export async function uploadScreenshot(file, orderId, onProgress) {
  const folder = "screenshots/" + (orderId || "general");
  return uploadToCloudinary(file, folder, onProgress);
}


// ============================================================
//  HELPER: getOptimizedURL(cloudinaryURL, width, height)
//
//  Cloudinary can resize and optimize images on the fly
//  just by changing the URL. This saves bandwidth and makes
//  your store load faster for customers.
//
//  Example:
//  Original: https://res.cloudinary.com/dq045stg3/image/upload/products/img.jpg
//  Optimized: ...upload/w_400,h_500,c_fill,q_auto,f_auto/products/img.jpg
//
//  w_400     = resize to 400px wide
//  h_500     = resize to 500px tall
//  c_fill    = crop to fill the dimensions (like object-fit:cover)
//  q_auto    = automatically choose best quality
//  f_auto    = automatically choose best format (WebP for Chrome, JPEG for others)
//
//  @param {string} url    - Original Cloudinary URL
//  @param {number} width  - Desired width in pixels
//  @param {number} height - Desired height in pixels
//  @returns {string}      - Optimized URL
// ============================================================
export function getOptimizedURL(url, width = 400, height = 500) {
  if (!url || !url.includes("cloudinary.com")) return url;

  // Insert transformation parameters into the URL
  // Cloudinary URLs look like: .../upload/v123/folder/filename.jpg
  // We insert our params after "/upload/"
  const transformation = `w_${width},h_${height},c_fill,q_auto,f_auto`;
  return url.replace("/upload/", `/upload/${transformation}/`);
}


// ============================================================
//  UPDATED saveProduct() FUNCTION
//
//  This completely replaces the saveProduct() in admin-logic.js
//  It's identical EXCEPT it calls uploadToCloudinary() instead
//  of fbUploadImage() for the image upload step.
//
//  Copy this function into admin-logic.js and replace the
//  existing saveProduct() function with it.
//  OR just keep this file loaded and it will override the old one.
// ============================================================
window.saveProduct = async function() {

  // ── Guard: prevent double-click ───────────────────────────
  if (window._isSaving) {
    console.log("Already saving — ignoring click.");
    return;
  }

  // ── Read form values ──────────────────────────────────────
  const name     = document.getElementById("product-name")?.value.trim()     || "";
  const price    = document.getElementById("product-price")?.value.trim()    || "";
  const category = document.getElementById("product-category")?.value       || "clothes";
  const desc     = document.getElementById("product-desc")?.value.trim()     || "";
  const stock    = document.getElementById("product-stock")?.value.trim()    || "0";
  const discount = document.getElementById("product-discount")?.value.trim() || "0";
  const imgInput = document.getElementById("product-img-input");
  const imageFile= imgInput?.files[0] || null;

  // Collect selected sizes
  const selectedSizes = [...document.querySelectorAll(".size-chip[data-selected='true']")]
    .map(c => c.textContent.trim()).join(", ");

  // ── Validate ──────────────────────────────────────────────
  if (!name) {
    window.showToast("Product name is required", "error");
    document.getElementById("product-name")?.focus();
    return;
  }
  if (!price || isNaN(parseFloat(price))) {
    window.showToast("Please enter a valid price", "error");
    document.getElementById("product-price")?.focus();
    return;
  }

  // ── Lock button ───────────────────────────────────────────
  window._isSaving = true;
  const saveBtn = document.getElementById("save-product-btn");
  const originalHTML = saveBtn?.innerHTML || "Save Product";
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<span style="display:inline-block;width:14px;height:14px;
      border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;
      animation:spin 0.7s linear infinite;margin-right:8px;vertical-align:middle;">
      </span>Uploading…`;
  }

  // Show progress bar
  const progressWrap = document.getElementById("upload-progress-wrap");
  const progressBar  = document.getElementById("upload-progress-bar");
  if (progressWrap) progressWrap.style.display = "block";

  try {
    let imageURL = "";

    // ── STEP 1: Upload image to CLOUDINARY (not Firebase) ────
    if (imageFile) {
      if (saveBtn) saveBtn.innerHTML = saveBtn.innerHTML.replace("Uploading…", "Uploading image…");

      // Call our Cloudinary upload function
      // "await" pauses here until the image is 100% uploaded
      // onProgress updates the progress bar as bytes are sent
      imageURL = await uploadProductImage(imageFile, (percent) => {
        if (progressBar) progressBar.style.width = percent + "%";
        if (saveBtn) {
          saveBtn.innerHTML = saveBtn.innerHTML.replace(/\d+%/, percent + "%") ||
            saveBtn.innerHTML;
        }
      });

      // Optimize the URL for product card display (400×500px)
      // This makes product images load faster for customers
      const optimizedURL = getOptimizedURL(imageURL, 400, 500);
      imageURL = optimizedURL || imageURL;
    }

    // ── STEP 2: Save product + Cloudinary URL to Firestore ───
    if (saveBtn) saveBtn.innerHTML = saveBtn.innerHTML.replace(/Uploading.*/, "Saving…");

    // Import Firestore functions
    const { db } = await import("./firebase.js");
    const { collection, addDoc, serverTimestamp } =
      await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const { auth } = await import("./firebase.js");

    const productData = {
      name,
      price:        parseFloat(price),
      category,
      description:  desc,
      stock:        parseInt(stock) || 0,
      discount:     parseInt(discount) || 0,
      sizes:        selectedSizes,
      imageURL,                          // ← Cloudinary URL saved here
      imageSource:  "cloudinary",        // Track where the image came from
      hidden:       false,
      createdAt:    serverTimestamp(),
      createdBy:    auth.currentUser?.email || "",
    };

    // Save to Firestore — "await" waits for confirmation
    const docRef = await addDoc(collection(db, "products"), productData);
    console.log("Product saved with ID:", docRef.id);

    // ── STEP 3: Success ───────────────────────────────────────
    window.showToast("Product saved successfully ✓", "success");
    resetProductForm();

    // Redirect back to overview after short delay
    setTimeout(() => {
      if (window.showPanel) window.showPanel("overview");
    }, 1200);

  } catch (error) {
    console.error("saveProduct error:", error);
    window.showToast(error.message || "Save failed — please try again", "error");

  } finally {
    // ALWAYS re-enable button whether save succeeded or failed
    window._isSaving = false;
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = originalHTML;
    }
    if (progressWrap) progressWrap.style.display = "none";
    if (progressBar)  progressBar.style.width = "0%";
  }
};


// ============================================================
//  UPDATED sendToWhatsApp() FUNCTION
//
//  Same as Stage 3 but uses Cloudinary for screenshot upload.
// ============================================================
window.sendToWhatsApp = async function(orderDetails, screenshotFile) {

  // Get WhatsApp number from settings
  const waRaw    = window._storeSettings?.whatsapp || "";
  const waNumber = waRaw.replace(/[^0-9]/g, "");

  if (!waNumber) {
    window.showToast("WhatsApp number not set — go to Wallet settings", "error");
    return;
  }

  const sendBtn = document.getElementById("send-whatsapp-btn");
  if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = "Uploading…"; }

  try {
    let screenshotURL = "";

    // ── Upload screenshot to Cloudinary ──────────────────────
    if (screenshotFile) {
      const orderId = orderDetails.orderId || "ORD-" + Date.now();

      // Call our Cloudinary upload function with progress tracking
      screenshotURL = await uploadScreenshot(
        screenshotFile,
        orderId,
        (percent) => {
          if (sendBtn) sendBtn.textContent = `Uploading… ${percent}%`;
        }
      );

      console.log("Screenshot uploaded to Cloudinary:", screenshotURL);
    }

    // ── Save order to Firestore ───────────────────────────────
    const { db } = await import("./firebase.js");
    const { doc, setDoc, serverTimestamp } =
      await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

    const orderData = {
      ...orderDetails,
      screenshotURL,                  // ← Cloudinary URL
      screenshotSource: "cloudinary", // Track the source
      status:    "pending",
      createdAt: serverTimestamp(),
    };

    await setDoc(doc(db, "orders", orderData.orderId), orderData);

    // ── Build WhatsApp message ────────────────────────────────
    const itemsList = (orderDetails.items || [])
      .map(i => `  • ${i.name} ×${i.qty}${i.size ? " (" + i.size + ")" : ""}`)
      .join("\n");

    const message =
`Hello AURA Fashion,

I have made a payment for my order.

🧾 ORDER: ${orderData.orderId}
📅 DATE: ${new Date().toLocaleDateString("en-GB")}

👤 CUSTOMER
Name: ${orderData.customerName}
Phone: ${orderData.customerPhone}
Address: ${orderData.address}, ${orderData.city}, ${orderData.country}

🛒 ITEMS
${itemsList}

💰 TOTAL: ${orderData.totalFormatted}

📸 PAYMENT PROOF:
${screenshotURL || "No screenshot attached"}

Thank you!`;

    // ── Encode and open WhatsApp ──────────────────────────────
    // encodeURIComponent converts spaces and special characters
    // into URL-safe codes so the link doesn't break
    const encoded  = encodeURIComponent(message);
    const waURL    = `https://wa.me/${waNumber}?text=${encoded}`;
    const opened   = window.open(waURL, "_blank");
    if (!opened) window.location.href = waURL;

    window.showToast("WhatsApp opened ✓", "success");
	
  } catch (error) {
    console.error("sendToWhatsApp error:", error);
    window.showToast(error.message || "Failed — please try again", "error");

  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = "📤 Send via WhatsApp";
    }
  }
};


// ── Make helpers available globally ──────────────────────────
window.uploadToCloudinary  = uploadToCloudinary;
window.uploadProductImage  = uploadProductImage;
window.uploadScreenshot    = uploadScreenshot;
window.getOptimizedURL     = getOptimizedURL;

console.log("Cloudinary upload module loaded ✓ — Cloud: dq045stg3");


