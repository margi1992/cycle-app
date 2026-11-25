# Cycle — a private period tracker (PWA)

Local-first web app. Data is stored in your browser's IndexedDB on your device only. No backend, no analytics, no third-party requests.

```
npm install
npm run dev        # develop
npm test           # date + prediction engine tests
npm run build      # outputs dist/ (static files)
npm run preview    # serve the production build at http://localhost:4173
```

## Deploy (free)
Upload `dist/` (or connect the repo, build command `npm run build`, output `dist`) to Cloudflare Pages, Netlify or GitHub Pages. HTTPS is required for install and service worker. Then open the URL on your phone → "Add to Home Screen". On iPhone this must be done from Safari (iOS 16.4+ for notifications).

## How predictions work
- Cycle length = days between consecutive period start dates; average of your last 6 (ignoring gaps under 10 or over 90 days). Default 35 until you have two periods.
- Next period = last start + average cycle. Three future cycles are shown.
- Period length = your setting (default 7) until two periods have end dates, then your average.

## Reminders
A web app cannot wake your phone while closed without a server that would learn your dates. So: (1) "Add reminders to my calendar" downloads an .ics with alerts N days before (re-import after logging a new period; events have stable IDs), and (2) an optional notification when you open the app inside the reminder window, shown once per prediction.

## Data
Settings → Export (JSON) and Delete all. Clearing browser data removes your records, so export occasionally. No sync between devices in v1.

## Desktop app (Windows)
```
npm run desktop        # build and open in an Electron window
npm run desktop:pack   # creates release/Cycle.exe (portable, no installer)
```
The desktop app is the same web app in its own window. Its data is stored in `%APPDATA%\Cycle` and is separate from the website's data (export from one, then re-add or keep using one). Unsigned, so Windows SmartScreen may warn on first launch: More info → Run anyway.
