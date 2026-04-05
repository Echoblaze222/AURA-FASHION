# ✦ AURA Fashion
### A premium designer streetwear e-commerce platform

![AURA Fashion](https://img.shields.io/badge/AURA-Fashion%202026-e8d5b0?style=for-the-badge&labelColor=080808)
![Firebase](https://img.shields.io/badge/Firebase-10.12.0-orange?style=for-the-badge&logo=firebase&labelColor=080808)
![Cloudinary](https://img.shields.io/badge/Cloudinary-Free-blue?style=for-the-badge&labelColor=080808)
![GitHub Pages](https://img.shields.io/badge/Hosted-GitHub%20Pages-black?style=for-the-badge&logo=github&labelColor=080808)

---

## 🌐 Live Website
**[View Live Store →](https://YOUR-USERNAME.github.io/YOUR-REPO-NAME)**

> Replace this link with your actual GitHub Pages URL

---

## 📱 What Is AURA?

AURA is a fully functional fashion e-commerce web app built for
designer streetwear store owners. It includes a customer-facing
storefront and a complete admin dashboard — all in one project.

**Customers can:**
- Browse products by category (Clothes, Shoes, Bags, Accessories)
- Create an account and sign in with Google or Email
- Add items to cart and checkout
- Upload payment screenshots
- Send orders directly to the store via WhatsApp
- Chat with the store instantly via WhatsApp bubble

**Admin can:**
- Add, edit, hide and delete products
- Upload product images (via Cloudinary — free)
- View and manage all orders
- Update order status (Pending → Confirmed → Shipped)
- View real-time analytics with full-width progress bars
- Search and filter products
- Configure bank/payment details
- Manage store settings

---

## 🗂 Project Structure

```
aura-fashion/
│
├── index.html                 ← Customer storefront
├── admin-dashboard.html       ← Admin panel (Stage 2 layout)
├── update-profile.html        ← First-time admin setup page
│
├── firebase.js                ← Firebase init + Auth (Stage 1)
├── admin-logic.js             ← Firebase CRUD functions (Stage 3)
├── admin-stage4.js            ← Analytics, Search, Toast (Stage 4)
├── cloudinary-upload.js       ← Image uploads via Cloudinary
├── customer-welcome.js        ← Welcome popup, greeting, WhatsApp
│
├── .nojekyll                  ← Tells GitHub Pages to skip Jekyll
└── README.md                  ← This file
```

---

## ⚙️ Tech Stack

| Layer | Technology | Cost |
|---|---|---|
| Frontend | Vanilla HTML, CSS, JavaScript | Free |
| Authentication | Firebase Auth (Google + Email) | Free |
| Database | Cloud Firestore | Free tier |
| Image Hosting | Cloudinary | Free (25GB) |
| Hosting | GitHub Pages | Free |
| Icons | Lucide Icons | Free |
| Fonts | Google Fonts (Cormorant + DM Sans) | Free |

**Total monthly cost: $0** until you reach significant scale.

---

## 🚀 Setup Guide (For New Buyers)

Follow these steps exactly in order.

### Step 1 — Create a Firebase Project
1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project** → give it a name
3. Enable **Google Analytics** (optional)
4. Go to **Project Settings** → **Your apps** → click **</>** (Web)
5. Register your app → copy the `firebaseConfig` object

### Step 2 — Enable Firebase Services
In your Firebase Console:

**Authentication:**
- Left sidebar → Authentication → Sign-in method
- Enable **Google** and **Email/Password**
- Settings tab → Authorized domains → Add your GitHub Pages URL

**Firestore:**
- Left sidebar → Firestore → Create database
- Choose **Production mode**
- Paste the Security Rules below

**Storage (optional — Cloudinary is used instead):**
- Only needed if you want to switch away from Cloudinary

### Step 3 — Create a Cloudinary Account
1. Go to [cloudinary.com](https://cloudinary.com) → Sign up free
2. Dashboard → note your **Cloud Name**
3. Settings → Upload → Upload Presets → Add preset
4. Set **Signing mode** to **Unsigned**
5. Name it `aura_products` → Save

### Step 4 — Configure the App
Open `firebase.js` and replace the config:
```javascript
const firebaseConfig = {
  apiKey:            "YOUR-API-KEY",
  authDomain:        "YOUR-PROJECT.firebaseapp.com",
  projectId:         "YOUR-PROJECT-ID",
  storageBucket:     "YOUR-PROJECT.appspot.com",
  messagingSenderId: "YOUR-SENDER-ID",
  appId:             "YOUR-APP-ID",
};
```

Open `cloudinary-upload.js` and replace:
```javascript
const CLOUDINARY = {
  cloudName:    "YOUR-CLOUD-NAME",
  apiKey:       "YOUR-API-KEY",
  uploadPreset: "YOUR-UPLOAD-PRESET",
};
```

### Step 5 — Set Security Rules

**Firestore Rules** (Firebase Console → Firestore → Rules):
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /products/{productId} {
      allow read: if true;
      allow write: if request.auth != null
        && request.auth.token.email == "YOUR-ADMIN-EMAIL";
    }

    match /orders/{orderId} {
      allow create: if request.auth != null;
      allow read, update: if request.auth != null
        && request.auth.token.email == "YOUR-ADMIN-EMAIL";
    }

    match /settings/{doc} {
      allow read, write: if request.auth != null
        && request.auth.token.email == "YOUR-ADMIN-EMAIL";
    }

    match /users/{userId} {
      allow read, write: if request.auth != null
        && request.auth.uid == userId;
    }

    match /feedback/{feedbackId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow delete: if request.auth != null
        && request.auth.token.email == "YOUR-ADMIN-EMAIL";
    }

    match /statuses/{statusId} {
      allow read: if true;
      allow write: if request.auth != null
        && request.auth.token.email == "YOUR-ADMIN-EMAIL";
    }
  }
}
```

### Step 6 — Deploy to GitHub Pages
1. Push all files to your GitHub repository
2. Repository → Settings → Pages
3. Source → Deploy from branch → main → / (root)
4. Wait 2 minutes → your site is live

---

## 🔐 First Admin Login

1. Visit your live site
2. Click the **+** floating button (bottom right)
3. Login with default credentials:
   - Email: `admin@aura.com`
   - Password: `aura2026`
4. You will be redirected to **update-profile.html**
5. Set your real email, store name and WhatsApp number
6. You will never see the default credentials again

---

## 💳 Admin Dashboard Features

### Top Navigation (Icon Bar)
| Icon | Action |
|---|---|
| 📊 | Overview / Dashboard |
| ➕ | Add new product |
| 🛍 | View all orders |
| ✕ | Exit admin (secure sign out) |

### Bottom Navigation (TikTok Style)
| Tab | Content |
|---|---|
| 📈 Analytics | Full-width progress bars, revenue, inventory |
| ⚙ Account | Store settings, credentials |
| 🏦 Wallet | Bank account details, payment link |

---

## 📦 Adding Your First Product

1. Log into admin dashboard
2. Tap **➕** in the top bar
3. Fill in: Name, Price, Category, Description, Stock
4. Upload a product image
5. Select sizes and colours
6. Tap **Save Product**
7. Image uploads to Cloudinary → URL saves to Firestore
8. Product appears on storefront immediately

---

## 📸 How Customer Orders Work

```
Customer browses store
        ↓
Adds items to cart (must be logged in)
        ↓
Fills in delivery details
        ↓
Sees bank transfer details
        ↓
Makes payment → uploads screenshot
        ↓
Screenshot uploads to Cloudinary
        ↓
WhatsApp opens with order details + screenshot URL
        ↓
Admin receives WhatsApp message
        ↓
Admin confirms order in dashboard
        ↓
Stock automatically decremented
```

---

## 🌍 Multi-Currency Support

The storefront automatically supports:
| Currency | Symbol | Auto-detected |
|---|---|---|
| USD — US Dollar | $ | ✓ |
| NGN — Nigerian Naira | ₦ | ✓ |
| ZAR — South African Rand | R | ✓ |
| KES — Kenyan Shilling | KSh | ✓ |

Exchange rates update live from open.er-api.com

---

## 🛒 Selling This Product

This app is sold as a **one-time license**. Each buyer gets:
- Their own Firebase project (free)
- Their own Cloudinary account (free)
- A customised copy of this code with their config

**Setup time per buyer: ~15 minutes**

Files to change per buyer:
1. `firebase.js` → swap `firebaseConfig`
2. `cloudinary-upload.js` → swap `CLOUDINARY` config
3. Firestore Security Rules → swap admin email
4. `update-profile.html` → buyer sets their own details on first login

---

## 🐛 Common Issues

**Products not showing on live site:**
- Check Firestore Data tab — do products exist?
- Check GitHub Pages has the latest files pushed
- Check Firestore Security Rules allow public reads

**Login not working on another device:**
- Add your GitHub Pages URL to Firebase Authorized Domains
- Authentication → Settings → Authorized Domains → Add domain

**Images not uploading:**
- Check Cloudinary upload preset is set to **Unsigned**
- Check cloud name and preset name match exactly in `cloudinary-upload.js`

**WhatsApp not opening:**
- Check WhatsApp number is saved in Admin → Wallet → Settings
- Number must include country code e.g. `+2348012345678`

---

## 📄 License

This project is sold as a commercial one-time license.
Each purchase covers one store deployment.
Redistribution or resale of the source code is not permitted.

---

## 👨‍💻 Built By

**Speed** — Student Developer
Building and selling software products independently.

---

*AURA Fashion — Where style meets intention. ✦*
