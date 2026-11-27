One State, Many Worlds - MEAN stack (MongoDB, Express, Angular, Node)

Prerequisites: Node.js 18+ and MongoDB running locally (mongodb://127.0.0.1:27017)

1) Backend   (terminal 1)
   cd backend
   npm install
   npm start                      -> API on http://localhost:3000 (auto-seeds Karnataka + 9 destinations)
   Optional env: MONGO_URI, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD (creates an admin account)

2) Frontend  (terminal 2)
   cd frontend
   npm install
   npm start                      -> open http://localhost:4200 (proxies /api to port 3000)

Admin login (created automatically on first run):
   email: admin@onestate.com   password: Admin@12345
   (change with ADMIN_EMAIL / ADMIN_PASSWORD env vars before first start)
   Admin tab: add/edit/delete destinations, add regions, delete reviews.

New features: images (Wikimedia), top-rated resorts & stays, reviews, coupons (WELCOME10, KARNATAKA15),
favourites, dark mode, weather + best time, remove-a-stop, group travellers, PDF (print), admin console
(registered users, coupons, activity log). New registrations also print in the backend terminal.
Note: resorts/stays are sample demo data; replace with real hotels before submission.

Resort owner portal: register as 'Resort owner' (or use demo owner@onestate.com / Owner@12345). Bookings alert the owner live.
Optional live hotel ratings: start backend with GOOGLE_PLACES_KEY=your-key (otherwise OpenStreetMap hotels with star class are shown).
