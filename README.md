# AURA — Fashion Website

> A dark, holographic, app-style fashion e-commerce website built entirely in a single HTML file. No frameworks. No dependencies. Just HTML, CSS, and JavaScript.

---

## What It Is

AURA is a full fashion storefront with a built-in admin panel, shopping cart, checkout flow, and payment confirmation system — all running from one file you can host anywhere for free.

The design is inspired by Apple product aesthetics: deep dark backgrounds, glowing hologram icons, 3D card animations, and a custom cursor.

---

## Features

### Storefront
- 6 category sections — Clothes, Shoes, Bags, Accessories, New Arrivals, Collections
- Holographic 3D product icons that rotate on hover and spin on click
- Product detail pages with size, color, and quantity selection
- Currency toggle between **USD** and **NGN** (live exchange rate via open API)
- Status bar (Instagram-style stories) for promotions and new-in posts
- Customer reviews section
- Brand bio section

### Shopping
- Add to cart with size and color selection
- Cart quantity management
- Checkout with full delivery address form
- Google Maps link for address confirmation
- Payment via bank transfer (details shown at checkout)
- Optional payment link (Paystack, Flutterwave, etc.)
- WhatsApp order confirmation — sends full order summary to admin
- Payment screenshot upload

### Admin Panel
- Password-protected admin login
- Full product CRUD — add, edit, hide, delete
- Product fields: name, description, price, stock, discount %, sizes, colors, image
- Order management with status tracking (Pending → Confirmed → Shipped)
- View customer payment screenshots
- Status/story post management
- Customer feedback moderation
- Settings: bank details, WhatsApp number, brand bio, admin credentials
- Admin account transfer feature

### Customer Accounts
- Multi-step sign-up flow with survey
- Social login simulation (Google, WhatsApp, Facebook, Email)
- Customer data stored locally

---

## How to Use

### 1. Open the file
Just double-click `fashion-portfolio.html` or drag it into a browser. No installation needed.

### 2. Admin login
Click the **+** button at the bottom right of the screen.

Default credentials:
```
Email:    admin@aura.com
Password: aura2026
```

### 3. Set up your store
Go to **Admin Dashboard → Settings** and fill in:
- Your bank name, account name, account number
- Your WhatsApp number (with country code, e.g. +2348012345678)
- Optional payment link
- Your brand bio

### 4. Add products
Click **+ Product** in the admin bar or dashboard. Fill in name, price, category, image, sizes, etc.

### 5. Host it online (free)
Drag the HTML file to [netlify.com/drop](https://netlify.com/drop) and you get a live link instantly — no account needed.

Or use **GitHub Pages**:
1. Create a GitHub repo
2. Upload the file as `index.html`
3. Go to Settings → Pages → Deploy from branch

---

## File Structure

This is a single-file project. Everything lives in `fashion-portfolio.html`:

```
fashion-portfolio.html
│
├── <style>          — All CSS (dark theme, animations, hologram effects)
├── <body>           — All HTML pages (home, category, cart, checkout, etc.)
└── <script>         — All JavaScript (state, routing, cart, admin, DB)
```

---

## How Data Is Stored

All data (products, orders, customers, settings) is saved in the browser's **localStorage**. This means:

- Data persists between page refreshes
- Data is tied to the browser/device it was entered on
- If you open the site on a different device or clear the browser, data will not be there

**For a shared, multi-device store** — the next step would be connecting to a cloud database like Firebase or Supabase. Contact your developer if you need that upgrade.

---

## Customization

### Change the brand name
Search for `AURA` in the HTML file and replace with your brand name.

### Change the admin password
Go to **Admin Dashboard → Settings → Admin Account** and update the password there. Or find this line in the `<script>` section:
```js
adminPw: "aura2026",
```

### Change colors
Look for the CSS variables at the top of the `<style>` block:
```css
:root {
  --bg: #040507;         /* Page background */
  --glow: #00c8ff;       /* Primary glow color (cyan) */
  --glow2: #7b61ff;      /* Secondary glow (purple) */
  --glow3: #ff61d8;      /* Accent glow (pink) */
  --gold: #c8a96e;       /* Gold accent */
}
```

### Add your own product images
In the Admin panel, each product has an image upload field. Upload a PNG or JPG directly — it gets stored in the browser.

For best results, use images that match the prompts provided separately (dark background, holographic rim lighting, 3:4 portrait ratio).

---

## Order Flow

```
Customer browses → Adds to cart → Creates account (survey) →
Fills checkout form → Views payment details → Transfers money →
Uploads screenshot → WhatsApp message sent to admin →
Admin confirms order in dashboard → Customer gets update
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Markup | HTML5 |
| Styling | CSS3 (custom properties, grid, animations) |
| Logic | Vanilla JavaScript (ES6+) |
| Storage | Browser localStorage |
| Fonts | Google Fonts (Cormorant Garamond + Montserrat) |
| Currency API | open.er-api.com (free, no key needed) |
| Hosting | Netlify Drop / GitHub Pages (free) |

---

## Browser Support

Works in all modern browsers:
- Chrome ✓
- Firefox ✓
- Safari ✓
- Edge ✓
- Mobile browsers ✓

---

## Planned Upgrades (Next Steps)

- [ ] Cloud database (Firebase/Supabase) for multi-device sync
- [ ] Real OAuth (Google/WhatsApp login)
- [ ] Email notifications to customer after order
- [ ] Admin analytics charts
- [ ] Product search and filter
- [ ] Wishlist feature
- [ ] Loyalty / referral system

---

## Project Credits

**Designed & Built by:** Speed  
**Built with:** Claude AI (Anthropic)  
**Year:** 2026  

---

## License

This project is for personal and commercial use by the owner. Do not redistribute or resell without permission.
