# VendorPay

A working prototype of cashless payments and discovery for informal street vendors. A vendor signs up with just a phone number, gets a personal QR code and starts taking payments. Customers use a live map to find nearby stalls that are open.

Set in Mexico City's Centro Histórico, with six fictional vendors already seeded. The app is **Spanish first**, with an English toggle on the home screen and in vendor settings.

## Run it

Needs **Node.js 22+** (Cloudflare's tooling requires it).

```bash
npm install
npm run dev
```

Open http://localhost:3000. `npm run dev` uses a local copy of the database (stored in `.wrangler/`). It creates itself and fills with demo data on the first visit. The app is designed for phones: use your browser's device toolbar, or open `http://<your-computer's-LAN-IP>:3000` on a phone on the same Wi-Fi. The QR codes then point at that address, so you can scan them with a real phone camera.

`npm run preview` builds and runs the app in Cloudflare's actual runtime locally, the closest thing to production.

## Try it in two minutes

1. **Buy:** Home → *Voy a comprar* (I'm buying) → filter by category or tap **Cerca de mí** (near me) → tap a stall → **Pagar** → tap items from its menu (or *Escribir monto* to type an amount) → **Pagar ahora** → rate it with one tap.
2. **Sell (demo):** Home → *Voy a vender* → tap **Tacos Doña Lupe** under the demo stalls. Keep the dashboard open in a second tab while paying from the first: within a few seconds the payment pops up and is read aloud ("Recibiste 81 pesos") and the phone vibrates. Tap the wallet to reveal the balance; tap a payment to refund it.
3. **Sign up:** *Voy a vender* → enter any 10-digit number → type the code from the on-screen "SMS simulado" → name, category, tap the map (or *Estoy aquí* to use GPS) → your stall is live with its own QR code and stall code. Add items under **Menú**.
4. **Savings circle:** dashboard → *Tanda* → **Aportar** (chip in), remind members who haven't paid, invite a vendor by phone (try `55 1234 0006`, Flores Mercedes), or turn on *Aportar de mis ventas* to chip in automatically from sales. *Que aporten todos los demás* fast-forwards the week.
5. **Insights:** dashboard → *Mi semana* for the last 7 days, best hours and regular customers.

## What's real vs. simulated

| Area | In this prototype |
|---|---|
| Money / payments | **Simulated.** No payment processor. Paying just adds to the vendor's in-app balance after a fake ~1 second "network" delay. |
| SMS / USSD | **Simulated.** The one-time code is shown on screen as a fake text message. Nothing is sent. |
| Sign-in / auth | **Simulated.** A plain cookie holds the vendor id. Not secure. |
| Database | **Real.** Cloudflare D1 (SQLite). Data is shared by everyone and survives restarts. The seeded vendors and history are fictional (`src/lib/seed.ts`). |
| Savings circle payouts | **Simulated.** Contributions and payouts move pretend balances. "Everyone else pays in" is a demo shortcut. |
| Map | **Real.** Leaflet with live OpenStreetMap tiles. Vendor locations are fictional. |
| QR codes | **Real.** Scannable codes linking to each vendor's pay page. |
| Customer identity | **Simulated.** Each browser gets an anonymous id in a cookie, standing in for the payer's account. It is used to count *different* customers and to let only the payer rate a payment. |
| Trust rating | **Real logic, simulated data.** Built from distinct paying customers: `5 × (1 − e^(−customers/25))`, blended 60/40 with the star average once there are 3+ ratings. A vendor's payments to their own stall and refunded payments don't count. "New" under 3 customers, "Trusted" at 4.0+. |
| Refunds | **Simulated money, real rules.** Within 7 days, once per payment, only if the wallet covers it. |
| Duplicate payments | **Real.** Each checkout carries a request id; a retried request is recorded once. |
| Savings circle invites and reminders | **Simulated SMS.** Nothing is sent. Joining an open circle needs 3 real sales; an invite from a member counts as a vouch and skips that. |
| Payment announcements | **Real.** Uses the browser's built-in speech and vibration. Browsers only speak after the page has been tapped once (the sound toggle counts). |
| Auto-close | **Real.** A stall left "open" with no activity for 6 hours closes itself, and the vendor sees why. The seeded demo stalls are exempt so the public map never empties. |
| Approximate location | **Real.** When on, the exact spot never leaves the server: the map gets a fixed offset of up to ~130 m and the landmark text is hidden. |

## Project layout

- `src/lib/store.ts`: database access and all business rules (payments, savings circle). Creates the tables and seeds demo data automatically
- `src/lib/seed.ts`: seeded vendors, 30 days of history with repeat customers and ratings, menus, one savings circle
- `src/lib/i18n.ts`: every UI string in Spanish and English
- `src/app/actions.ts`: server actions called by the UI
- `src/app/map`: customer map · `src/app/v/[id]`: vendor profile and QR · `src/app/v/[id]/pay`: payment flow
- `src/app/vendor`: vendor dashboard, `start` (phone sign-in), `setup` (onboarding), `qr`, `tanda` (savings circle), `menu`, `insights`, `settings`

## Deploy to Cloudflare

The app runs on Cloudflare Workers (via the [OpenNext adapter](https://opennext.js.org/cloudflare)) with a D1 database. `wrangler.jsonc` holds the config.

**Connected to GitHub (Workers Builds):** no build settings needed. Leave the Build command empty and keep the Deploy command as `npx wrangler deploy`. When Cloudflare installs dependencies, `scripts/ci-build.mjs` detects Workers Builds (`WORKERS_CI=1`) and builds the app. Every push to `main` then builds and deploys. On the first deploy, Wrangler creates the `vendorpay-db` D1 database automatically. The app creates its tables and seeds the six demo vendors on the first visit.

**From your computer instead:** `npx wrangler login`, then `npm run deploy`.

### Reset the demo data

Clears everything testers created and puts back the six demo vendors (within ~30 seconds of the next visit). Databases created by an older version of the app upgrade themselves automatically on the next visit; no reset needed.

```bash
npx wrangler login     # once
npm run reset-demo
```

`npm run reset-demo:local` does the same for your local dev database.
