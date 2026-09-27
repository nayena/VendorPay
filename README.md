# VendorPay

A working prototype of cashless payments and discovery for informal street vendors. A vendor signs up with just a phone number, gets a personal QR code and starts taking payments. Customers use a live map to find nearby stalls that are open.

Set in Mexico City's Centro Histórico, with six fictional vendors already seeded.

## Run it

Needs **Node.js 22+** (Cloudflare's tooling requires it).

```bash
npm install
npm run dev
```

Open http://localhost:3000. `npm run dev` uses a local copy of the database (stored in `.wrangler/`). It creates itself and fills with demo data on the first visit. The app is designed for phones: use your browser's device toolbar, or open `http://<your-computer's-LAN-IP>:3000` on a phone on the same Wi-Fi. The QR codes then point at that address, so you can scan them with a real phone camera.

`npm run preview` builds and runs the app in Cloudflare's actual runtime locally, the closest thing to production.

## Try it in two minutes

1. **Buy:** Home → *I'm buying* → tap a pin → **Pay** → enter an amount → **Pay now**.
2. **Sell (demo):** Home → *I'm selling* → tap **Tacos Doña Lupe** under "Try a demo stall". The dashboard shows the payment you just made. It refreshes every few seconds, so keep it open in a second tab while paying from the first.
3. **Sign up:** *I'm selling* → enter any 10-digit number → type the code from the on-screen "Simulated SMS" → name, category, tap the map → your stall is live on the map with its own QR code.
4. **Savings circle:** from the dashboard → *Savings circle* → **Chip in**. Use *Everyone else pays in* to fast-forward the week and watch the pot go to the next member.

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
| Trust rating | **Real logic, simulated data.** Computed from completed sales: `5 × (1 − e^(−sales/35))`, "New" under 3 sales, "Trusted" at 4.0+. |

## Project layout

- `src/lib/store.ts`: database access and all business rules (payments, savings circle). Creates the tables and seeds demo data automatically
- `src/lib/seed.ts`: seeded vendors, 30 days of history, one savings circle
- `src/app/actions.ts`: server actions called by the UI
- `src/app/map`: customer map · `src/app/v/[id]`: vendor profile and QR · `src/app/v/[id]/pay`: payment flow
- `src/app/vendor`: vendor dashboard, `start` (phone sign-in), `setup` (onboarding), `qr`, `tanda` (savings circle)

## Deploy to Cloudflare

The app runs on Cloudflare Workers (via the [OpenNext adapter](https://opennext.js.org/cloudflare)) with a D1 database. `wrangler.jsonc` holds the config.

**Connected to GitHub (Workers Builds):** in the Cloudflare dashboard, open the `vendorpay` Worker → **Settings → Build**, and set:

| Setting | Value |
|---|---|
| Build command | `npx opennextjs-cloudflare build` |
| Deploy command | `npx wrangler deploy` |

Every push to `main` then builds and deploys. On the first deploy, Wrangler creates the `vendorpay-db` D1 database automatically. The app creates its tables and seeds the six demo vendors on the first visit.

**From your computer instead:** `npx wrangler login`, then `npm run deploy`.

### Reset the demo data

Clears everything testers created and puts back the six demo vendors (within ~30 seconds of the next visit):

```bash
npx wrangler login     # once
npm run reset-demo
```

`npm run reset-demo:local` does the same for your local dev database.
