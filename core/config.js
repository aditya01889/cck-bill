/* ============================================================
   Shared static configuration
   All backend URLs, UPI credentials, product catalog, user list,
   dispatch constants, and the shared fetchWithTimeout helper live
   here. Change a URL or product once — not in every feature file.
   ============================================================ */

/* ---- Environment detection ---- */
const _host = location.hostname;
export const IS_PROD   = _host === 'cck-bill.vercel.app';
export const IS_DEV    = _host === 'localhost' || _host.includes('-dev.');
export const ENV_LABEL = IS_PROD ? 'Production' : IS_DEV ? 'Development' : 'Preview';

/* EDIT ZONE 1 — GOOGLE APPS SCRIPT WEB APP URLS
   To add a staging backend: deploy a second Apps Script version and set the
   staging URL below, then swap based on IS_PROD. */
export const SHEET_WEBHOOK_URL       = "https://script.google.com/macros/s/AKfycbxAiGRuOVaN61HJe8szgTGQlA1iun-mjO-3MmhTYW1Jwnyzfc9ZKAmCR9f281-BrZV2/exec";
export const INGREDIENTS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbwQu7pHeXayRv87M7-zUinXNTiw8YQaXXAMQ_E8tY-oLuhGs5tUwqC7dPBBxogCJLKObA/exec";

/* EDIT ZONE 1B — UPI PAYMENT */
export const UPI_ID = "cozycatkitchen@ptaxis";
export const UPI_PAYEE_NAME = "CozyCatKitchen";

export const DEFAULT_FETCH_TIMEOUT_MS = 15000;

export async function fetchWithTimeout(resource, options = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(resource, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/* EDIT ZONE 2 — PRODUCT CATALOG */
export const CATALOG = [
  {
    category: "Meals (70g)",
    items: [
      { name: "Nourish", price: 70 },
      { name: "Vitality", price: 70 },
      { name: "Power", price: 85 },
      { name: "Supreme", price: 85 },
      { name: "Nurture", price: 100 },
      { name: "Thrive", price: 100 }
    ]
  },
  {
    category: "Broths (100ml)",
    items: [
      { name: "Essence", price: 100 },
      { name: "Bone Rich", price: 100 }
    ]
  },
  {
    category: "Cozy Meals Combos",
    comboCategory: true,
    items: [
      { name: "Starter Kit (Assorted Pack of 12)", price: 1670 },
      { name: "Vitality",                 price24: 2330, price60: 4850 },
      { name: "Nourish",                  price24: 2330, price60: 4850 },
      { name: "Supreme",                  price24: 2690, price60: 5750 },
      { name: "Power",                    price24: 2690, price60: 5750 },
      { name: "Nurture",                  price24: 3050, price60: 6650 },
      { name: "Thrive",                   price24: 3050, price60: 6650 },
      { name: "Assorted (4 Each/10 Each)", name24: "Assorted (Pack of 24 / 4 Each)", name60: "Assorted (Pack of 60 / 10 Each)", price24: 2690, price60: 5750 }
    ]
  },
  {
    category: "Treats",
    items: [
      { name: "Cookies 100g", price: 120 },
      { name: "Cookies 200g", price: 200 },
      { name: "Happy Tummy Cupcake (pack of 2)", price: 300 },
      { name: "Purr-fect Protein Cupcake (pack of 2)", price: 300 },
      { name: "Veggie Mew Cupcake (pack of 2)", price: 350 },
      { name: "Tuna Delight Cupcake (pack of 2)", price: 400 },
      { name: "Fruity Paws Cupcake (pack of 2)", price: 400 },
      { name: "Golden Glow Cupcake (pack of 2)", price: 450 }
    ]
  }
];

// Flatten catalog into a product list; combos expand into Pack-of-24/60 rows.
export const PRODUCTS = [];
CATALOG.forEach(cat => {
  cat.items.forEach(item => {
    if (cat.comboCategory) {
      if (item.price !== undefined) {
        PRODUCTS.push({ name: item.name, price: item.price, category: cat.category });
      } else {
        const n24 = item.name24 || `${item.name} (Pack of 24)`;
        const n60 = item.name60 || `${item.name} (Pack of 60)`;
        PRODUCTS.push({ name: n24, price: item.price24, category: cat.category });
        PRODUCTS.push({ name: n60, price: item.price60, category: cat.category });
      }
    } else {
      PRODUCTS.push({ name: item.name, price: item.price, category: cat.category });
    }
  });
});

/* EDIT ZONE 3 — USERS (UI metadata only)
   Passwords are stored on the backend (Users sheet). This list controls
   per-user landing tab and visible tabs — it is a UX convenience, not
   a security boundary. The real gate is the server-side token check. */
export const USERS = [
  { name: "Aditya",   landing: "dashboard", access: ["dashboard","newbill","orders","ingredients","settings"] },
  { name: "Priyanka", landing: "newbill",   access: ["newbill","orders","dashboard"] },
];

/* Fulfillment / dispatch constants */
export const SENDER_NAME = "Cozy Cat Kitchen";
export const SENDER_ADDRESS = "Jaypee Klassic, Sector 134, Noida 201304";
export const BOXES = [
  { label: "Box 1 (35.5×30.5×26.5 cm)", dims: [35.5, 30.5, 26.5] },
  { label: "Box 2 (22×26×20 cm)",        dims: [22, 26, 20] },
];
export const PRODUCT_WEIGHTS = {
  "Nourish": 70, "Vitality": 70, "Power": 70, "Supreme": 70, "Nurture": 70, "Thrive": 70,
  "Essence": 100, "Bone Rich": 100,
  "Cookies 100g": 100, "Cookies 200g": 200,
  "Happy Tummy Cupcake (pack of 2)": 100, "Purr-fect Protein Cupcake (pack of 2)": 100,
  "Veggie Mew Cupcake (pack of 2)": 100, "Tuna Delight Cupcake (pack of 2)": 100,
  "Fruity Paws Cupcake (pack of 2)": 100, "Golden Glow Cupcake (pack of 2)": 100,
  "Nourish (Pack of 24)": 1680, "Vitality (Pack of 24)": 1680, "Power (Pack of 24)": 1680,
  "Supreme (Pack of 24)": 1680, "Nurture (Pack of 24)": 1680, "Thrive (Pack of 24)": 1680,
  "Assorted (Pack of 24 / 4 Each)": 1680,
  "Nourish (Pack of 60)": 4200, "Vitality (Pack of 60)": 4200, "Power (Pack of 60)": 4200,
  "Supreme (Pack of 60)": 4200, "Nurture (Pack of 60)": 4200, "Thrive (Pack of 60)": 4200,
  "Assorted (Pack of 60 / 10 Each)": 4200,
  "Starter Kit (Assorted Pack of 12)": 840,
};
