// ============================================================
//  AURA FASHION — admin-stage4.js
//  Stage 4: Analytics, Search, Filter, Exit Admin & Polish
//
//  HOW TO ADD THIS FILE:
//  In admin-dashboard.html, just before </body>, add:
//  <script type="module" src="admin-stage4.js"></script>
//
//  WHAT THIS FILE ADDS ON TOP OF STAGE 3:
//   1. loadAnalytics()     — real-time Firestore analytics with
//                            animated full-width progress bars
//   2. initProductSearch() — live search-as-you-type + category filter
//   3. exitAdmin()         — secure Firebase signOut + redirect
//   4. Toast system        — Apple-style glass notifications
//                            (replaces ALL alert() calls)
//   5. Full cleanup        — every variable scoped, no globals,
//                            every function documented
//
//  MODULE SCOPE NOTE:
//  Because this file uses "type='module'", EVERY variable and
//  function declared here is PRIVATE to this file by default.
//  Nothing leaks into the global window object accidentally.
//  We only attach to window the things the HTML buttons need.
// ============================================================


// ── IMPORTS ─────────────────────────────────────────────────
import { auth, db } from "./firebase.js";

import {
  collection,
  getDocs,
  query,
  orderBy,
  onSnapshot,       // Real-time listener — fires on every Firestore change
  where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import {
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";


// ============================================================
//  SECTION 1: PRIVATE MODULE STATE
//  These variables are ONLY accessible inside this file.
//  They cannot be accidentally overwritten by other scripts.
// ============================================================

// Holds the full unfiltered product list for search/filter to work on
let _allProducts = [];

// Holds the full unfiltered order list for analytics
let _allOrders = [];

// Tracks which category filter is currently active ("all" by default)
let _activeCategory = "all";

// The live Firestore listener — stored so we can turn it off when
// the admin logs out (prevents memory leaks and permission errors)
let _analyticsUnsubscribe = null;

// Revenue goal — used to calculate progress bar percentages
// The admin can change this in Settings (Stage 5 could add a UI for it)
const REVENUE_GOAL_USD = 10000; // $10,000 monthly target

// Order count goal for the orders progress bar
const ORDERS_GOAL = 200;


// ============================================================
//  SECTION 2: STARTUP
//  Wait for auth to confirm who is logged in, then initialize
//  every Stage 4 feature in sequence.
// ============================================================
onAuthStateChanged(auth, (user) => {
  if (!user) {
    // Not logged in — the Stage 3 guard already handles redirect,
    // but we add a safety net here too
    return;
  }

  // ── Initialize all Stage 4 features ──────────────────────
  // We wrap in a try/catch so one failing feature doesn't
  // break all the others
  try {
    initToastSystem();      // Must be first — everything else uses toasts
    initProductSearch();    // Wire up the search bar and category filters
    initExitAdminButton();  // Wire up the logout button
    startAnalyticsListener(); // Start listening to Firestore for live analytics
    injectToastCSS();       // Inject the toast CSS into the page
  } catch (err) {
    console.error("Stage 4 init error:", err);
  }
});


// ============================================================
//  FEATURE 1: REAL-TIME ANALYTICS
//
//  HOW REAL-TIME WORKS WITH onSnapshot():
//  ─────────────────────────────────────────────────────────
//  In Stage 3 we used getDocs() — it reads data ONCE and stops.
//  onSnapshot() is different — it keeps WATCHING Firestore.
//
//  Every time ANY order document changes (new order, status
//  update, deletion), Firestore automatically sends the new
//  data to the browser and our callback function runs again.
//
//  This means analytics update INSTANTLY with no page refresh.
//
//  Think of getDocs() as a photograph — one moment in time.
//  Think of onSnapshot() as a live video feed — always current.
// ============================================================

/**
 * startAnalyticsListener()
 * Attaches a real-time Firestore listener to the orders collection.
 * Every time an order is added, updated or deleted, this fires
 * automatically and recalculates all analytics bars.
 */
function startAnalyticsListener() {

  // Build the query — all orders, newest first
  const ordersQuery = query(
    collection(db, "orders"),
    orderBy("createdAt", "desc")
  );

  // onSnapshot() returns an "unsubscribe" function.
  // We store it in _analyticsUnsubscribe so we can call it
  // when the admin logs out — this stops the listener cleanly.
  _analyticsUnsubscribe = onSnapshot(
    ordersQuery,

    // ── SUCCESS CALLBACK — fires whenever data changes ─────
    // "snapshot" contains ALL the current documents (not just changes)
    (snapshot) => {

      // Convert the Firestore snapshot into a plain JS array
      _allOrders = [];
      snapshot.forEach((docSnap) => {
        _allOrders.push({
          id: docSnap.id,
          ...docSnap.data()   // Spread all Firestore fields into the object
        });
      });

      // Recalculate and render all the analytics bars
      renderAnalyticsBars(_allOrders);

      console.log(`Analytics updated: ${_allOrders.length} orders loaded.`);
    },

    // ── ERROR CALLBACK — fires if listener fails ──────────
    (error) => {
      console.error("Analytics listener error:", error.code);
      // If it's a permission error, the session may have expired
      if (error.code === "permission-denied") {
        showToast("Session expired — please log in again.", "error");
        setTimeout(() => secureSignOut(), 2000);
      }
    }
  );
}

/**
 * loadAnalytics()
 * Public function — can be called manually to force a refresh.
 * Normally the onSnapshot listener handles this automatically.
 */
async function loadAnalytics() {
  try {
    const snap = await getDocs(
      query(collection(db, "orders"), orderBy("createdAt", "desc"))
    );
    _allOrders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAnalyticsBars(_allOrders);
  } catch (err) {
    console.error("loadAnalytics failed:", err);
    showToast("Could not load analytics — check connection", "error");
  }
}

// Expose loadAnalytics so the HTML panel button can call it
window.loadAnalytics = loadAnalytics;

/**
 * renderAnalyticsBars(orders)
 * Calculates all metrics from the orders array and updates every
 * progress bar, stat chip, and percentage display on the page.
 *
 * HOW THE BAR WIDTH IS CALCULATED:
 *   width% = (currentValue / goalValue) × 100
 *   Example: $5,200 revenue / $10,000 goal × 100 = 52% wide bar
 *   We cap at 100% so bars never overflow their container.
 *
 * @param {Array} orders - Array of order objects from Firestore
 */
function renderAnalyticsBars(orders) {

  // ── CALCULATE ALL METRICS ──────────────────────────────────

  const totalOrders     = orders.length;
  const pendingOrders   = orders.filter(o => o.status === "pending").length;
  const confirmedOrders = orders.filter(o => o.status === "confirmed").length;
  const shippedOrders   = orders.filter(o => o.status === "shipped").length;

  // Total revenue = sum of totals for confirmed and shipped orders only
  // We don't count pending orders as revenue since payment isn't confirmed
  const totalRevenue = orders
    .filter(o => o.status === "confirmed" || o.status === "shipped")
    .reduce((sum, order) => {
      // parseFloat handles both number and string values safely
      return sum + (parseFloat(order.total) || 0);
    }, 0);

  // Average order value (avoid dividing by zero)
  const avgOrderValue = confirmedOrders > 0
    ? (totalRevenue / confirmedOrders)
    : 0;

  // Confirmation rate as a percentage
  const confirmRate = totalOrders > 0
    ? Math.round((confirmedOrders / totalOrders) * 100)
    : 0;

  // Count unique customers by phone number
  const uniqueCustomers = new Set(
    orders.map(o => o.customerPhone).filter(Boolean)
  ).size;

  // ── CALCULATE BAR WIDTHS ───────────────────────────────────
  // Each bar width is capped at 100 using Math.min
  // Each bar is floored at 2 using Math.max so there's always
  // a visible sliver even when value is very small

  const revenueWidth  = clampPercent(totalRevenue,  REVENUE_GOAL_USD);
  const ordersWidth   = clampPercent(totalOrders,   ORDERS_GOAL);
  const confirmWidth  = confirmRate; // Already a percentage
  const avgWidth      = clampPercent(avgOrderValue, 500); // $500 avg goal

  // Category breakdown — count orders per category
  const categoryBreakdown = calcCategoryBreakdown(orders);

  // ── UPDATE THE DOM ─────────────────────────────────────────
  // Update stat chips
  updateText("stat-orders",    totalOrders);
  updateText("stat-customers", uniqueCustomers);

  // Update progress bar values and widths
  updateBar({
    valueId:    "bar-monthly-sales",
    fillClass:  "bar-revenue-fill",
    value:      "$" + totalRevenue.toLocaleString("en-US", { maximumFractionDigits: 0 }),
    width:      revenueWidth,
    changeEl:   "bar-revenue-change",
    changeText: revenueWidth >= 100 ? "🎯 Goal hit!" : revenueWidth + "% of goal",
    changeType: revenueWidth >= 100 ? "up" : "neutral"
  });

  updateBar({
    valueId:   "bar-total-orders",
    fillClass: "bar-orders-fill",
    value:     totalOrders,
    width:     ordersWidth,
    subText:   `${confirmedOrders} confirmed · ${pendingOrders} pending · ${shippedOrders} shipped`,
    subEl:     "bar-orders-sub"
  });

  updateBar({
    valueId:   "bar-confirm-rate",
    fillClass: "bar-confirm-fill",
    value:     confirmRate + "%",
    width:     confirmWidth,
  });

  updateBar({
    valueId:   "bar-avg-order",
    fillClass: "bar-avg-fill",
    value:     "$" + avgOrderValue.toFixed(0),
    width:     avgWidth,
  });

  // Category bars
  const maxCatCount = Math.max(...Object.values(categoryBreakdown), 1);
  Object.entries(categoryBreakdown).forEach(([cat, count]) => {
    const pct = clampPercent(count, maxCatCount);
    updateBar({
      valueId:   `bar-cat-${cat}`,
      fillClass: `bar-cat-fill-${cat}`,
      value:     Math.round((count / totalOrders) * 100) + "%",
      width:     pct,
    });
  });

  // Update the analytics panel full breakdown too
  renderFullAnalyticsPanel(orders, totalRevenue, avgOrderValue, confirmRate);
}

/**
 * calcCategoryBreakdown(orders)
 * Counts how many orders contained items from each category.
 * Returns an object like: { clothes: 12, shoes: 8, bags: 4 }
 */
function calcCategoryBreakdown(orders) {
  const counts = {
    clothes: 0, shoes: 0, bags: 0,
    accessories: 0, "new-arrivals": 0, collections: 0
  };
  orders.forEach(order => {
    (order.items || []).forEach(item => {
      const cat = item.category || "clothes";
      if (counts[cat] !== undefined) counts[cat]++;
    });
  });
  return counts;
}

/**
 * renderFullAnalyticsPanel(orders, revenue, avg, confirmRate)
 * Rebuilds the full Analytics panel with live data.
 * Called every time onSnapshot fires with new data.
 */
function renderFullAnalyticsPanel(orders, totalRevenue, avgOrderValue, confirmRate) {
  const container = document.getElementById("adm-full-analytics");
  if (!container) return;

  const total     = orders.length;
  const confirmed = orders.filter(o => o.status === "confirmed").length;
  const pending   = orders.filter(o => o.status === "pending").length;
  const shipped   = orders.filter(o => o.status === "shipped").length;
  const maxStatus = Math.max(confirmed, pending, shipped, 1);

  // Build inventory health bars from the cached product list
  const inventoryRows = _allProducts.map(p => {
    const stock     = parseInt(p.stock) || 0;
    const maxStock  = 50; // Visual max for the bar
    const pct       = clampPercent(stock, maxStock);
    const color     = stock === 0
      ? "var(--red)"
      : stock <= 5
        ? "var(--amber)"
        : "var(--green)";
    const badgeClass = stock === 0
      ? "badge--out"
      : stock <= 5
        ? "badge--low"
        : "badge--confirmed";
    const badgeText = stock === 0 ? "Out" : stock <= 5 ? "Low" : "OK";

    return `
      <div class="stat-bar">
        <div class="stat-bar__top">
          <span class="stat-bar__label"
            style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            ${escapeHTML(p.name)}
          </span>
          <span class="stat-bar__value" style="font-size:1.1rem;">${stock}</span>
          <span class="badge ${badgeClass}" style="font-size:0.45rem;padding:3px 8px;">
            ${badgeText}
          </span>
        </div>
        <div class="stat-bar__track">
          <div class="stat-bar__fill" style="width:${pct}%;background:${color};
            transition:width 0.9s cubic-bezier(0.16,1,0.3,1);"></div>
        </div>
      </div>`;
  }).join("") || `<p style="font-size:var(--fs-small);color:var(--white3);padding:16px 0;">
    No products yet.</p>`;

  container.innerHTML = `
    <!-- Revenue summary -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px;">
      <div class="quick-stat">
        <span class="quick-stat__icon">💰</span>
        <span class="quick-stat__value">$${totalRevenue.toLocaleString("en-US",{maximumFractionDigits:0})}</span>
        <span class="quick-stat__label">Total Revenue</span>
      </div>
      <div class="quick-stat">
        <span class="quick-stat__icon">📈</span>
        <span class="quick-stat__value">$${avgOrderValue.toFixed(0)}</span>
        <span class="quick-stat__label">Avg Order</span>
      </div>
    </div>

    <!-- Revenue progress toward goal -->
    <p class="section-label">Revenue Goal — $${REVENUE_GOAL_USD.toLocaleString()}</p>
    <div class="card" style="margin-bottom:20px;">
      <div class="card__body">
        <div class="stat-bar" style="padding-top:0;">
          <div class="stat-bar__top">
            <span class="stat-bar__label">Progress</span>
            <span class="stat-bar__value">
              $${totalRevenue.toLocaleString("en-US",{maximumFractionDigits:0})}
            </span>
            <span class="stat-bar__change stat-bar__change--${
              clampPercent(totalRevenue, REVENUE_GOAL_USD) >= 100 ? "up" : "neutral"
            }">
              ${clampPercent(totalRevenue, REVENUE_GOAL_USD)}%
            </span>
          </div>
          <div class="stat-bar__track">
            <div class="stat-bar__fill stat-bar__fill--accent"
              style="width:${clampPercent(totalRevenue, REVENUE_GOAL_USD)}%;
                     transition:width 1s cubic-bezier(0.16,1,0.3,1);">
            </div>
          </div>
          <p class="stat-bar__sub">
            $${Math.max(0, REVENUE_GOAL_USD - totalRevenue).toLocaleString()} remaining to goal
          </p>
        </div>
      </div>
    </div>

    <!-- Order status breakdown -->
    <p class="section-label">Order Breakdown</p>
    <div class="card" style="margin-bottom:20px;">
      <div class="card__body">
        ${[
          { label:"Confirmed", value:confirmed, color:"var(--green)" },
          { label:"Pending",   value:pending,   color:"var(--amber)" },
          { label:"Shipped",   value:shipped,   color:"var(--white2)" },
        ].map(({ label, value, color }) => `
          <div class="stat-bar">
            <div class="stat-bar__top">
              <span class="stat-bar__label">${label}</span>
              <span class="stat-bar__value" style="font-size:1.2rem;">${value}</span>
              <span class="stat-bar__change stat-bar__change--neutral">
                ${total > 0 ? Math.round((value/total)*100) : 0}%
              </span>
            </div>
            <div class="stat-bar__track">
              <div class="stat-bar__fill"
                style="width:${clampPercent(value, maxStatus)}%;
                       background:${color};
                       transition:width 0.9s cubic-bezier(0.16,1,0.3,1);">
              </div>
            </div>
          </div>`).join("")}
      </div>
    </div>

    <!-- Confirmation rate -->
    <p class="section-label">Confirmation Rate</p>
    <div class="card" style="margin-bottom:20px;">
      <div class="card__body">
        <div class="stat-bar" style="padding-top:0;">
          <div class="stat-bar__top">
            <span class="stat-bar__label">Payments confirmed</span>
            <span class="stat-bar__value">${confirmRate}%</span>
          </div>
          <div class="stat-bar__track">
            <div class="stat-bar__fill"
              style="width:${confirmRate}%;
                     background:${confirmRate >= 70 ? "var(--green)" : "var(--amber)"};
                     transition:width 0.9s cubic-bezier(0.16,1,0.3,1);">
            </div>
          </div>
          <p class="stat-bar__sub">
            ${confirmRate >= 70
              ? "✓ Healthy confirmation rate"
              : "⚠ Follow up on pending orders"}
          </p>
        </div>
      </div>
    </div>

    <!-- Inventory health -->
    <p class="section-label">Inventory Health</p>
    <div class="card">
      <div class="card__body">${inventoryRows}</div>
    </div>
  `;
}


// ============================================================
//  FEATURE 2: PRODUCT SEARCH & CATEGORY FILTER
//
//  HOW THE SEARCH WORKS:
//  ─────────────────────────────────────────────────────────
//  The search bar uses the "input" event which fires on EVERY
//  keystroke — so results update as you type, instantly.
//
//  We don't query Firestore on every keystroke (that would be
//  slow and expensive). Instead we:
//   1. Load ALL products once into _allProducts
//   2. Filter that local array on every keypress
//   3. Re-render only the filtered results
//
//  The category filter works the same way — it filters _allProducts
//  by category field, then applies the search on top.
// ============================================================

/**
 * initProductSearch()
 * Called on startup. Injects the search bar HTML into the
 * products panel, then attaches event listeners.
 */
function initProductSearch() {

  // Find the products panel header so we can insert the search bar below it
  const productsPanel = document.getElementById("panel-products") ||
                        document.getElementById("adm-products");
  if (!productsPanel) return;

  // Only inject once (guard against multiple calls)
  if (document.getElementById("product-search-bar")) return;

  // ── Build the search + filter HTML ────────────────────────
  const searchHTML = `
    <div id="product-search-bar" style="
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 20px;
    ">

      <!-- Search input -->
      <div style="position:relative;">
        <!-- Search icon inside the input -->
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="1.75"
          style="position:absolute;left:14px;top:50%;transform:translateY(-50%);
                 color:var(--white3);pointer-events:none;">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          type="search"
          id="product-search-input"
          placeholder="Search products…"
          autocomplete="off"
          style="
            width: 100%;
            background: var(--black3);
            border: 0.5px solid var(--white4);
            border-radius: var(--btn-radius);
            padding: 12px 16px 12px 42px;
            color: var(--white);
            font-family: 'DM Sans', sans-serif;
            font-size: var(--fs-body);
            outline: none;
            -webkit-appearance: none;
            transition: border-color 0.2s ease, box-shadow 0.2s ease;
          "
          onfocus="this.style.borderColor='rgba(245,245,245,0.3)';
                   this.style.boxShadow='0 0 0 3px rgba(245,245,245,0.04)'"
          onblur="this.style.borderColor='';this.style.boxShadow=''"
        />
        <!-- Clear button — only visible when there's text -->
        <button
          id="search-clear-btn"
          onclick="clearProductSearch()"
          style="
            display: none;
            position: absolute;
            right: 12px; top: 50%;
            transform: translateY(-50%);
            background: var(--white4);
            border: none;
            width: 20px; height: 20px;
            border-radius: 50%;
            color: var(--white3);
            font-size: 0.65rem;
            cursor: pointer;
            align-items: center;
            justify-content: center;
          "
        >✕</button>
      </div>

      <!-- Category filter pills -->
      <div style="display:flex;gap:7px;overflow-x:auto;padding-bottom:2px;"
           id="category-filter-row">
        ${["all","clothes","shoes","bags","accessories","new-arrivals","collections"]
          .map(cat => `
            <button
              class="category-filter-btn"
              data-category="${cat}"
              onclick="filterByCategory('${cat}')"
              style="
                flex-shrink: 0;
                padding: 7px 15px;
                border-radius: 100px;
                border: 0.5px solid var(--white4);
                background: ${cat === "all" ? "var(--white)" : "transparent"};
                color: ${cat === "all" ? "var(--black)" : "var(--white3)"};
                font-family: 'DM Sans', sans-serif;
                font-size: var(--fs-micro);
                font-weight: 500;
                letter-spacing: 0.06em;
                text-transform: capitalize;
                cursor: pointer;
                transition: all 0.18s ease;
                white-space: nowrap;
              "
            >${cat === "all" ? "All" : cat.replace("-", " ")}</button>
          `).join("")}
      </div>

      <!-- Result count — shown when search is active -->
      <p id="search-result-count"
        style="font-size:var(--fs-micro);color:var(--white3);
               letter-spacing:0.08em;display:none;">
      </p>

    </div>
  `;

  // Insert the search bar just before the products list container
  const prodList = document.getElementById("adm-prod-list");
  if (prodList) {
    prodList.insertAdjacentHTML("beforebegin", searchHTML);
  }

  // ── Attach the search event listener ──────────────────────
  // "input" fires on every single keypress — perfect for live search
  const searchInput = document.getElementById("product-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", handleProductSearch);
  }
}

/**
 * handleProductSearch()
 * Runs on every keypress in the search input.
 * Filters _allProducts by the search term AND active category,
 * then re-renders only the matching products.
 */
function handleProductSearch() {
  const input    = document.getElementById("product-search-input");
  const clearBtn = document.getElementById("search-clear-btn");
  if (!input) return;

  const term = input.value.trim().toLowerCase();

  // Show/hide the clear (✕) button
  if (clearBtn) {
    clearBtn.style.display = term ? "flex" : "none";
  }

  // Run the filter and render results
  applyProductFilters(term, _activeCategory);
}

/**
 * filterByCategory(category)
 * Called when a category pill is clicked.
 * Updates the active category and re-applies all filters.
 *
 * @param {string} category - "all" | "clothes" | "shoes" | etc.
 */
window.filterByCategory = function(category) {
  _activeCategory = category;

  // Update pill button styles — active = white filled, others = ghost
  document.querySelectorAll(".category-filter-btn").forEach(btn => {
    const isActive = btn.dataset.category === category;
    btn.style.background  = isActive ? "var(--white)"  : "transparent";
    btn.style.color       = isActive ? "var(--black)"  : "var(--white3)";
    btn.style.borderColor = isActive ? "var(--white)"  : "";
  });

  // Get current search term and re-apply both filters together
  const term = document.getElementById("product-search-input")?.value.trim().toLowerCase() || "";
  applyProductFilters(term, category);
};

/**
 * applyProductFilters(searchTerm, category)
 * The core filter function. Takes the full _allProducts array
 * and returns only the items that match BOTH filters.
 *
 * @param {string} searchTerm - Lowercase search string (can be empty)
 * @param {string} category   - Category slug or "all"
 */
function applyProductFilters(searchTerm, category) {
  let filtered = _allProducts;

  // ── Apply category filter first ───────────────────────────
  // If category is "all", skip this step (keep everything)
  if (category !== "all") {
    filtered = filtered.filter(p => p.category === category);
  }

  // ── Apply search term filter ──────────────────────────────
  // We search across multiple fields:
  //   - Product name (most important)
  //   - Description
  //   - Category label
  // Using .includes() for simple substring matching
  if (searchTerm) {
    filtered = filtered.filter(p => {
      const searchableText = [
        p.name        || "",
        p.description || "",
        p.desc        || "",
        p.category    || "",
      ].join(" ").toLowerCase();

      return searchableText.includes(searchTerm);
    });
  }

  // ── Update result count display ───────────────────────────
  const countEl = document.getElementById("search-result-count");
  if (countEl) {
    if (searchTerm || category !== "all") {
      countEl.style.display = "block";
      countEl.textContent = filtered.length === 0
        ? "No products found"
        : `${filtered.length} product${filtered.length !== 1 ? "s" : ""} found`;
    } else {
      countEl.style.display = "none";
    }
  }

  // ── Render the filtered results ───────────────────────────
  renderFilteredProducts(filtered, searchTerm);
}

/**
 * renderFilteredProducts(products, highlightTerm)
 * Renders a filtered array of products into the products list.
 * Highlights matching text in the product name if a search term is active.
 *
 * @param {Array}  products      - Filtered product array to display
 * @param {string} highlightTerm - Search term to highlight in names
 */
function renderFilteredProducts(products, highlightTerm = "") {
  const container = document.getElementById("adm-prod-list");
  if (!container) return;

  if (!products.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">🔍</div>
        <div class="empty-state__title">No results</div>
        <div class="empty-state__sub">
          Try a different search term or category filter.
        </div>
        <button class="btn-ghost" onclick="clearProductSearch()"
          style="margin-top:16px;">Clear Search</button>
      </div>`;
    return;
  }

  container.innerHTML = products.map(p => {

    // ── Highlight matching text in the product name ──────────
    // We wrap the matching part in a <mark> tag styled with CSS
    let displayName = escapeHTML(p.name);
    if (highlightTerm && displayName.toLowerCase().includes(highlightTerm)) {
      const regex = new RegExp(`(${escapeRegex(highlightTerm)})`, "gi");
      displayName = displayName.replace(
        regex,
        `<mark style="background:rgba(232,213,176,0.25);color:var(--accent);
                      border-radius:3px;padding:0 2px;">$1</mark>`
      );
    }

    const stock      = parseInt(p.stock) || 0;
    const badgeClass = stock === 0 ? "badge--out" : stock <= 5 ? "badge--low" : "badge--confirmed";
    const badgeText  = stock === 0 ? "Out" : stock <= 5 ? `${stock} left` : `${stock} in stock`;

    return `
      <div class="card mb-16" style="
        display: grid;
        grid-template-columns: 64px 1fr auto;
        gap: 14px;
        padding: 16px;
        align-items: center;
        animation: fadeUp 0.3s cubic-bezier(0.16,1,0.3,1) both;
      ">
        <!-- Product thumbnail -->
        <div style="width:64px;height:64px;border-radius:10px;overflow:hidden;
                    background:var(--black3);flex-shrink:0;">
          ${p.imageURL
            ? `<img src="${p.imageURL}" alt="${escapeHTML(p.name)}"
                    style="width:100%;height:100%;object-fit:cover;"
                    loading="lazy"/>`
            : `<div style="width:100%;height:100%;display:flex;align-items:center;
                           justify-content:center;font-size:1.5rem;opacity:0.3;">📦</div>`
          }
        </div>

        <!-- Product info -->
        <div style="min-width:0;">
          <div style="font-size:var(--fs-body);font-weight:500;margin-bottom:3px;
                      overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            ${displayName}
          </div>
          <div style="font-size:var(--fs-micro);color:var(--white3);
                      letter-spacing:0.06em;text-transform:uppercase;margin-bottom:2px;">
            ${p.category?.replace("-", " ") || ""}
          </div>
          <div style="font-size:var(--fs-small);color:var(--white2);">
            $${parseFloat(p.price || 0).toFixed(2)}
            ${p.discount
              ? `<span style="color:var(--green);font-size:0.5rem;margin-left:4px;">
                   -${p.discount}%</span>`
              : ""}
          </div>
        </div>

        <!-- Actions -->
        <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;
                    align-items:flex-end;">
          <span class="badge ${badgeClass}" style="font-size:0.45rem;">
            ${badgeText}
          </span>
          <div style="display:flex;gap:5px;">
            <button class="btn-sm" onclick="window.editProduct('${p.id}')">
              Edit
            </button>
            <button class="btn-sm"
              style="color:var(--red);border-color:rgba(255,59,48,0.3);"
              onclick="window.deleteProduct('${p.id}')">
              Del
            </button>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

/**
 * clearProductSearch()
 * Resets the search input and category filter back to defaults.
 */
window.clearProductSearch = function() {
  const input = document.getElementById("product-search-input");
  if (input) input.value = "";

  // Re-apply with empty term and "all" category
  _activeCategory = "all";
  document.querySelectorAll(".category-filter-btn").forEach(btn => {
    const isAll = btn.dataset.category === "all";
    btn.style.background  = isAll ? "var(--white)"  : "transparent";
    btn.style.color       = isAll ? "var(--black)"  : "var(--white3)";
    btn.style.borderColor = isAll ? "var(--white)"  : "";
  });

  const clearBtn = document.getElementById("search-clear-btn");
  if (clearBtn) clearBtn.style.display = "none";

  const countEl = document.getElementById("search-result-count");
  if (countEl) countEl.style.display = "none";

  applyProductFilters("", "all");
};


// ============================================================
//  FEATURE 3: EXIT ADMIN — SECURE SIGN OUT
//
//  WHY THIS IS IMPORTANT:
//  Just hiding the dashboard UI is NOT secure. The session
//  is still active in Firebase. Anyone who opened DevTools
//  could still make authenticated requests.
//
//  firebase.signOut() does three things:
//   1. Deletes the auth token from the browser's storage
//   2. Marks the session as ended in Firebase
//   3. Triggers onAuthStateChanged with user=null everywhere
//
//  After signOut(), even if someone navigates back to
//  admin-dashboard.html, the onAuthStateChanged guard in
//  Stage 3 will immediately redirect them to index.html.
// ============================================================

/**
 * initExitAdminButton()
 * Wires up the Exit Admin / Logout button in the top bar.
 */
function initExitAdminButton() {
  // The top bar logout button (from Stage 2 HTML)
  const logoutBtn = document.querySelector(".top-bar__btn--logout");
  if (logoutBtn) {
    // Remove any existing onclick (Stage 2 had a placeholder)
    logoutBtn.removeAttribute("onclick");
    logoutBtn.addEventListener("click", confirmAndSignOut);
  }

  // The sign out button in the Settings panel
  const settingsSignOut = document.querySelector(
    "[onclick=\"handleLogout()\"], [onclick='handleLogout()']"
  );
  if (settingsSignOut) {
    settingsSignOut.removeAttribute("onclick");
    settingsSignOut.addEventListener("click", confirmAndSignOut);
  }
}

/**
 * confirmAndSignOut()
 * Shows a confirmation toast before signing out.
 * Gives the admin 3 seconds to cancel.
 */
function confirmAndSignOut() {
  // Instead of a disruptive confirm() dialog, we show an
  // inline confirmation toast with a cancel option
  showToast(
    "Signing out… <button onclick=\"cancelSignOut()\" style=\"background:none;border:none;color:var(--accent);cursor:pointer;font-family:inherit;font-size:inherit;text-decoration:underline;margin-left:4px;\">Cancel</button>",
    "neutral",
    3500 // Show for 3.5 seconds
  );

  // Schedule the actual sign out after 3 seconds
  // (cancelled if admin clicks the Cancel button in the toast)
  window._signOutTimer = setTimeout(() => {
    secureSignOut();
  }, 3000);
}

/**
 * cancelSignOut()
 * Cancels a pending sign-out. Called from the toast Cancel button.
 */
window.cancelSignOut = function() {
  clearTimeout(window._signOutTimer);
  hideToast();
  showToast("Sign out cancelled", "success");
};

/**
 * secureSignOut()
 * The actual sign-out sequence:
 *  1. Stop the Firestore real-time listener (prevent errors)
 *  2. Call Firebase signOut()
 *  3. Redirect to index.html
 */
async function secureSignOut() {
  try {
    // ── Step 1: Stop the analytics listener ─────────────────
    // If we don't unsubscribe, Firestore will try to send data
    // to a logged-out user, causing permission errors in the console.
    if (_analyticsUnsubscribe) {
      _analyticsUnsubscribe(); // Call the unsubscribe function
      _analyticsUnsubscribe = null;
      console.log("Analytics listener stopped.");
    }

    // ── Step 2: Clear local data ─────────────────────────────
    // Good practice — don't leave sensitive data in memory
    _allProducts = [];
    _allOrders   = [];
    storeSettings = {};

    // ── Step 3: Firebase sign out ────────────────────────────
    // This is the critical step — it invalidates the auth token.
    // "await" waits for Firebase to confirm the sign-out before
    // redirecting, so we don't leave before it's done.
    await signOut(auth);
    console.log("Firebase sign out successful.");

    // ── Step 4: Redirect to login page ───────────────────────
    // window.location.replace() replaces the current history entry
    // so the admin CAN'T press the Back button to get back in.
    window.location.replace("index.html");

  } catch (error) {
    console.error("Sign out failed:", error);
    // Even if signOut() fails, still redirect — the guard on
    // the dashboard page will catch any unauthenticated access
    window.location.replace("index.html");
  }
}

// Expose secureSignOut to window for direct calls
window.exitAdmin    = confirmAndSignOut;
window.handleLogout = confirmAndSignOut;
window.secureSignOut = secureSignOut;


// ============================================================
//  FEATURE 4: APPLE-STYLE TOAST NOTIFICATION SYSTEM
//
//  This replaces ALL alert() calls in the app.
//
//  DESIGN SPEC:
//  ─────────────────────────────────────────────────────────
//  - Appears at the TOP CENTER of the screen
//  - Glass morphism background (blur + semi-transparent)
//  - Slides down on show, fades out on hide
//  - Three types: success (green), error (red), neutral (white)
//  - Auto-dismisses after 3 seconds (configurable)
//  - Safe to call multiple times — cancels previous timer
//  - Supports HTML content (for cancel buttons, links, etc.)
//
//  HOW TO USE FROM ANYWHERE IN YOUR CODE:
//    showToast("Product saved!", "success");
//    showToast("Connection error", "error");
//    showToast("Settings saved ✓", "success", 2000);
// ============================================================

// The toast DOM element (created by injectToastCSS)
let _toastEl = null;

// Timer reference so we can cancel auto-dismiss
let _toastTimer = null;

/**
 * initToastSystem()
 * Creates the toast DOM element and appends it to the body.
 * Called once on startup.
 */
function initToastSystem() {
  // Don't create twice
  if (document.getElementById("aura-toast")) {
    _toastEl = document.getElementById("aura-toast");
    return;
  }

  _toastEl = document.createElement("div");
  _toastEl.id = "aura-toast";
  _toastEl.setAttribute("role", "status");          // Screen reader support
  _toastEl.setAttribute("aria-live", "polite");     // Announces to screen readers
  _toastEl.setAttribute("aria-atomic", "true");

  document.body.appendChild(_toastEl);

  // Override the old showToast function from Stage 2
  // so everything uses this new version
  window.showToast = showToast;
  window.hideToast = hideToast;
}

/**
 * showToast(message, type, duration)
 * Shows an Apple-style glass toast notification at the top of the screen.
 *
 * @param {string} message  - The text (or HTML) to display
 * @param {string} type     - "success" | "error" | "neutral" | "gold"
 * @param {number} duration - Milliseconds before auto-dismiss (default 3000)
 */
function showToast(message, type = "neutral", duration = 3000) {
  if (!_toastEl) {
    // Fallback if element doesn't exist yet
    console.log(`Toast [${type}]:`, message);
    return;
  }

  // Cancel any running auto-dismiss timer
  clearTimeout(_toastTimer);

  // Set the message content (supports HTML)
  _toastEl.innerHTML = buildToastContent(message, type);

  // Apply type-specific class for colour
  _toastEl.className = `aura-toast aura-toast--${type} aura-toast--visible`;

  // Auto-dismiss after duration ms
  // (cancelled if showToast is called again before timer fires)
  _toastTimer = setTimeout(hideToast, duration);
}

/**
 * hideToast()
 * Hides the toast with a fade-out animation.
 */
function hideToast() {
  if (!_toastEl) return;
  _toastEl.classList.remove("aura-toast--visible");
  clearTimeout(_toastTimer);
}

/**
 * buildToastContent(message, type)
 * Builds the inner HTML for a toast — icon + message text.
 */
function buildToastContent(message, type) {
  const icons = {
    success: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>`,
    error:   `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2.5">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
              </svg>`,
    neutral: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2.5">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>`,
    gold:    `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2.5">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02
                                 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>`,
  };

  const icon = icons[type] || icons.neutral;

  return `
    <span style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
      ${icon}
    </span>
    <span style="flex:1;">${message}</span>
  `;
}

/**
 * injectToastCSS()
 * Injects the toast CSS directly into the page's <head>.
 * This way the CSS lives alongside the JS — no separate file needed.
 *
 * TOAST CSS EXPLAINED LINE BY LINE:
 */
function injectToastCSS() {
  if (document.getElementById("aura-toast-styles")) return; // Already injected

  const style = document.createElement("style");
  style.id = "aura-toast-styles";
  style.textContent = `

    /* ── Toast container ──────────────────────────────────────
       position: fixed   → floats above ALL other content
       top: 20px         → sits near the top of the SCREEN
                           (not the page — the screen/viewport)
       left: 50%         → starts at the horizontal center
       transform: translateX(-50%) → shifts left by half its own
                           width, truly centering it
       z-index: 9999     → above everything including modals
    ──────────────────────────────────────────────────────── */
    .aura-toast {
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%) translateY(-80px);

      /* Size and shape */
      max-width: 340px;
      width: max-content;
      padding: 12px 18px;
      border-radius: 100px;     /* Full pill shape */

      /* Glass morphism effect:
         background with opacity + blur of what's behind */
      background: rgba(18, 18, 18, 0.9);
      backdrop-filter: blur(20px) saturate(160%);
      -webkit-backdrop-filter: blur(20px) saturate(160%);
      border: 0.5px solid rgba(245, 245, 245, 0.12);

      /* Typography */
      font-family: 'DM Sans', -apple-system, sans-serif;
      font-size: 0.75rem;
      font-weight: 400;
      letter-spacing: 0.02em;
      color: rgba(245, 245, 245, 0.85);
      white-space: nowrap;

      /* Layout: icon + text side by side */
      display: flex;
      align-items: center;
      gap: 10px;

      /* Depth */
      box-shadow:
        0 4px 24px rgba(0, 0, 0, 0.5),
        0 0 0 0.5px rgba(255, 255, 255, 0.05) inset;

      /* Hidden by default — slides in when .aura-toast--visible added */
      opacity: 0;
      pointer-events: none;  /* Don't block clicks when hidden */

      /* Smooth slide + fade animation */
      transition:
        transform 0.35s cubic-bezier(0.16, 1, 0.3, 1),
        opacity 0.3s ease;

      /* Stack context */
      z-index: 9999;
    }

    /* ── Visible state ─────────────────────────────────────────
       When JS adds this class, the toast slides DOWN into view
       and becomes fully opaque.
       translateY(-80px) → translateY(0px) = slides down 80px
    ────────────────────────────────────────────────────────── */
    .aura-toast--visible {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
      pointer-events: auto;  /* Can be clicked when visible */
    }

    /* ── Type variants (colour + border changes) ─────────────── */
    .aura-toast--success {
      color: #34c759;
      border-color: rgba(52, 199, 89, 0.25);
    }

    .aura-toast--error {
      color: #ff3b30;
      border-color: rgba(255, 59, 48, 0.25);
    }

    .aura-toast--gold {
      color: #e8d5b0;
      border-color: rgba(232, 213, 176, 0.25);
    }

    .aura-toast--neutral {
      color: rgba(245, 245, 245, 0.85);
      border-color: rgba(245, 245, 245, 0.1);
    }

    /* ── Spin animation for loading states ───────────────────── */
    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* ── fadeUp animation for product cards ─────────────────── */
    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0);   }
    }
  `;

  document.head.appendChild(style);
}


// ============================================================
//  FEATURE 5: FINAL CODE CLEANUP UTILITIES
//
//  Small helper functions used throughout the app.
//  All private (not on window) — they can't clash with anything.
// ============================================================

/**
 * clampPercent(value, max)
 * Converts a value into a percentage of max, clamped between 2 and 100.
 * The minimum of 2 ensures there's always a visible sliver in the bar.
 *
 * @param {number} value - Current value (e.g. 52 orders)
 * @param {number} max   - Maximum/goal value (e.g. 100 orders)
 * @returns {number}     - Percentage between 2 and 100
 */
function clampPercent(value, max) {
  if (!max || max <= 0) return 2;
  return Math.min(100, Math.max(2, Math.round((value / max) * 100)));
}

/**
 * updateText(elementId, value)
 * Safely sets the textContent of an element.
 * Does nothing if the element doesn't exist.
 */
function updateText(elementId, value) {
  const el = document.getElementById(elementId);
  if (el) el.textContent = value;
}

/**
 * updateBar({ valueId, fillClass, value, width, ... })
 * Updates both the displayed number AND the progress bar width
 * for a single stat bar. All parameters except valueId are optional.
 *
 * @param {Object} opts - Configuration object
 */
function updateBar({ valueId, fillClass, value, width = 0, subText, subEl, changeEl, changeText, changeType }) {
  // Update the displayed value (the big number)
  if (valueId) updateText(valueId, value);

  // Update the bar fill width
  if (fillClass) {
    const fill = document.querySelector(`.${fillClass}`);
    if (fill) fill.style.width = width + "%";
  }

  // Update sub-label text
  if (subEl && subText) updateText(subEl, subText);

  // Update the change indicator pill
  if (changeEl && changeText) {
    const el = document.getElementById(changeEl);
    if (el) {
      el.textContent  = changeText;
      el.className = `stat-bar__change stat-bar__change--${changeType || "neutral"}`;
    }
  }
}

/**
 * escapeHTML(str)
 * Prevents XSS by converting HTML special characters to safe entities.
 * Always use this when inserting user data into innerHTML.
 *
 * Example: '<script>' → '&lt;script&gt;'
 *
 * @param {string} str - Raw string that might contain HTML characters
 * @returns {string}   - Safe string for use in innerHTML
 */
function escapeHTML(str) {
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(str || ""));
  return div.innerHTML;
}

/**
 * escapeRegex(str)
 * Escapes special regex characters in a string so it can be
 * safely used inside a RegExp() constructor.
 *
 * Example: "C++ class" → "C\+\+ class"
 *
 * @param {string} str - String to escape
 * @returns {string}   - Regex-safe string
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Placeholder to silence reference — storeSettings used in saveSettingsSection
// which lives in admin-logic.js. This var ensures no reference error here.
let storeSettings = {};


// ============================================================
//  EXPOSE FUNCTIONS TO WINDOW (only what HTML buttons need)
//
//  Everything else stays private to this module.
//  This is the complete and final list of public-facing functions.
// ============================================================
window.showToast          = showToast;
window.hideToast          = hideToast;
window.loadAnalytics      = loadAnalytics;
window.filterByCategory   = filterByCategory;
window.clearProductSearch = clearProductSearch;
window.exitAdmin          = confirmAndSignOut;
window.handleLogout       = confirmAndSignOut;
window.cancelSignOut      = cancelSignOut;

// Update the products panel whenever it's loaded
// (bridges Stage 3's allProducts with Stage 4's search)
document.addEventListener("DOMContentLoaded", () => {
  // Listen for the custom "productsLoaded" event from Stage 3
  window.addEventListener("productsLoaded", (e) => {
    _allProducts = e.detail || [];
    // Initialize the search bar now that we have products
    initProductSearch();
  });
});

console.log("Stage 4 loaded ✓ — Analytics, Search, Exit Admin, Toasts ready.");

