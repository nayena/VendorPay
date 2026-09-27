# VendorPay

A working prototype of cashless payments and discovery for informal street vendors. A vendor signs up with just a phone number, gets a personal QR code and starts taking payments. Customers use a live map to find nearby stalls that are open.

Set in Mexico City's Centro Histórico, with six fictional vendors already seeded.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. It's designed for phones: use your browser's device toolbar, or open `http://<your-computer's-LAN-IP>:3000` on a phone on the same Wi-Fi. The QR codes then point at that address, so you can scan them with a real phone camera.

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
| Database | **Simulated.** Everything lives in server memory and resets when the server restarts (`src/lib/seed.ts`). |
| Savings circle payouts | **Simulated.** Contributions and payouts move pretend balances. "Everyone else pays in" is a demo shortcut. |
| Map | **Real.** Leaflet with live OpenStreetMap tiles. Vendor locations are fictional. |
| QR codes | **Real.** Scannable codes linking to each vendor's pay page. |
| Trust rating | **Real logic, simulated data.** Computed from completed sales: `5 × (1 − e^(−sales/35))`, "New" under 3 sales, "Trusted" at 4.0+. |

## Project layout

- `src/lib/store.ts`: in-memory data and all business rules (payments, trust, savings circle)
- `src/lib/seed.ts`: seeded vendors, 30 days of history, one savings circle
- `src/app/actions.ts`: server actions called by the UI
- `src/app/map`: customer map · `src/app/v/[id]`: vendor profile and QR · `src/app/v/[id]/pay`: payment flow
- `src/app/vendor`: vendor dashboard, `start` (phone sign-in), `setup` (onboarding), `qr`, `tanda` (savings circle)

## Deploy (so testers only need a link)

The repo includes a Render Blueprint (`render.yaml`), so there is nothing to configure by hand.

1. Sign in at [render.com](https://render.com) with your GitHub account.
2. Open **[Deploy to Render](https://render.com/deploy?repo=https://github.com/nayena/VendorPay)** (or *New → Blueprint* and pick this repo).
3. Click **Apply**. The first build takes a few minutes, and then you get a URL like `https://vendorpay.onrender.com` to send to testers.

Every push to `main` redeploys automatically.

Things to know:
- **Data resets** on every deploy or restart, back to the six seeded vendors. That's expected for this prototype.
- **Free plan sleeps** after about 15 idle minutes. The next visit takes ~30–60 seconds to wake it up, and the data resets. Switch the service to the *Starter* plan to keep it awake during a testing session.
- **Must be one server.** Data lives in server memory, so don't run it on serverless hosting (e.g. Vercel) or scale it to more than one instance. Any host that runs `npm ci && npm run build` then `npm start` works (Railway, Fly.io, a VPS). The app listens on `$PORT`.
