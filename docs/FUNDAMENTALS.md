# Fundamentals — The Concepts, As Processes

`CODE_GUIDE.md` explains what each file does. This document is different: it walks through the
*end-to-end sequence* behind each core concept in this project — the actual order of events, not
just a definition. If you can narrate any of these processes step-by-step in your own words,
you understand that concept well enough for an interview.

---

## Process 1: Placing an order (the concurrency-safe path)

This is the project's signature "hard problem." Here's exactly what happens, in order, when a
customer places an order for 2 products:

1. **Frontend** (`OrdersPage.tsx`) collects customer name + line items into `CreateOrderRequest`,
   calls `POST /api/orders`.
2. **`OrdersController.Create`** receives the request, no business logic here — just calls
   `_service.CreateAsync(request)` and translates the result/exception into an HTTP response.
3. **`OrderService.CreateAsync`** opens a database transaction:
   `await using var transaction = await _db.Database.BeginTransactionAsync();`
   Everything from here until `CommitAsync()` either *all* succeeds or *all* rolls back.
4. For **each line item**, `DeductStockWithRetryAsync` runs:
   a. Read the product's current `QuantityOnHand` and `RowVersion` fresh from the database.
   b. Check `QuantityOnHand >= requestedQuantity` — if not enough stock, throw immediately
      (this aborts the whole transaction, nothing already deducted for earlier items sticks).
   c. Subtract the quantity, add a `StockMovement` row (`StockOut`, reason = order number).
   d. Call `SaveChangesAsync()`. EF Core's generated `UPDATE` statement includes
      `WHERE Id = @id AND RowVersion = @originalRowVersion` — this is the concurrency check.
   e. **If another request updated the same product in between steps (a) and (d)**, the
      `WHERE` clause matches zero rows, EF throws `DbUpdateConcurrencyException`. The catch
      block detaches all tracked entities and the `for` loop tries again from step (a) — up to
      3 attempts — re-reading the *now-current* quantity and `RowVersion`.
   f. After 3 failed attempts, give up with an error (extremely rare in practice; only happens
      under sustained, heavy contention on the exact same product row).
5. Once every line item succeeds, the `Order` + `OrderItem` rows are added, total calculated,
   and `transaction.CommitAsync()` makes it all permanent at once.
6. If *anything* threw along the way, the `catch` block calls `transaction.RollbackAsync()` —
   any stock already deducted for earlier line items in this same order gets undone too.

**The one sentence that proves you understand it**: *"Two customers can race for the last unit
of the same product, and exactly one of them wins — the loser's write silently fails the
version check, retries, sees the now-accurate (zero) stock, and gets a clean 'insufficient
stock' error instead of the database ending up negative."*

---

## Process 2: Logging in and staying logged in

1. User submits username/password on `LoginPage.tsx` → `AuthContext.login()` → `POST /api/auth/login`.
2. **`AuthController.Login`**: looks up the user by username, calls
   `_passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password)` — the
   submitted password is hashed and compared to the stored hash; the plaintext password is never
   stored or compared directly.
3. If it matches, `TokenService.GenerateToken(user)` builds a JWT containing three claims
   (user id, username, role) signed with a secret key, valid for `Jwt:ExpiryMinutes` (120 min).
4. **Frontend** receives `{ token, username, role, expiresAt }`, stores it via
   `AuthContext`'s `setUser(...)`.
5. A `useEffect` inside `AuthContext` (dependency: `[user]`) fires *after* that state update and
   writes the whole object to `localStorage` — this is what survives a page refresh.
6. **On every subsequent API call**, `apiClient`'s request interceptor (`api/client.ts`) reads
   the token from `localStorage` and attaches `Authorization: Bearer <token>` automatically —
   no page-by-page code has to remember to do this.
7. **On page load/refresh**: `AuthContext`'s `useState` doesn't start empty — its initializer
   function `readStoredUser()` checks `localStorage` first, and only returns a user if
   `expiresAt` is still in the future. This is why refreshing the page doesn't log you out.
8. **If a request ever gets a 401** (token expired/invalid), the response interceptor clears
   `localStorage` and redirects to `/login` — centralized in one place, not repeated per page.

---

## Process 3: Generating an AI product description

1. Staff clicks **✨ Generate** on the New Product form (`ProductsPage.tsx`).
2. `handleGenerateDescription` first checks `form.name` isn't empty — fails fast client-side
   before spending an API call on nothing.
3. Resolves the category *name* from the selected category *id* (`categories.find(...)`) since
   the AI prompt wants a human-readable category, not a database id.
4. Calls `generateProductDescription({ productName, categoryName })` →
   `POST /api/ai/generate-description`.
5. **`AiController.GenerateDescription`** (requires auth, no role restriction) delegates to
   `ProductDescriptionService.GenerateAsync`.
6. The service builds a prompt: a system message ("you are a helpful assistant that writes
   short, professional product descriptions...") plus a user message containing the actual
   product name/category, and POSTs it as JSON to Groq's chat-completions endpoint with the
   API key in the `Authorization: Bearer` header.
7. Groq's response JSON is parsed (`choices[0].message.content`) and returned to the frontend.
8. Frontend writes the returned text straight into `form.description` — one click, no separate
   "preview and accept" step.

**Failure path worth knowing**: if `Groq:ApiKey` isn't configured, the service throws
`InvalidOperationException` with a clear message *before* ever making the HTTP call — the
controller catches it and returns `400 Bad Request` with that message, so a misconfigured
deployment fails loudly and specifically, not with a confusing generic 500.

---

## Process 4: A React state change, start to finish

Using the Products page's stock-adjust button (+10) as the concrete example:

1. User clicks **+10** → `onClick={() => handleAdjust(product, 10)}` fires.
2. `handleAdjust` calls `adjustStock(product.id, 10, 'Manual restock')` — an `await`ed API call.
   Nothing in React re-renders yet; this is just a function executing.
3. The API call resolves → `handleAdjust` calls `await refresh()`.
4. `refresh()` calls `setProducts(productList)` (and `setLoading`, `setError`) — **this is the
   moment React is told something changed.**
5. React schedules a re-render of `ProductsPage`. During that re-render, the component function
   runs again top to bottom — every `useMemo` in it checks whether its dependencies changed
   (none in this file, but this is the same mechanism the Dashboard's chart data uses).
6. React diffs the new output against what's on screen and updates only what actually changed in
   the real DOM (the updated quantity cell) — not a full page redraw.
7. *After* that render commits, any `useEffect` whose dependency array includes something that
   changed would fire now — e.g., this is the exact moment `AuthContext`'s `localStorage`-sync
   effect would run if `user` had been what changed instead.

**The one sentence that proves you understand it**: *"A state update doesn't change the screen
directly — it schedules a re-render; the render recalculates memoized values synchronously; only
after the new UI is painted do effects run, which is why effects can never be used to compute a
value the current render needs."*

---

## Process 5: Push to production (CI/CD)

1. `git push origin main`.
2. GitHub detects the push, triggers **two** workflows in parallel (defined in
   `.github/workflows/*.yml`), because backend and frontend deploy to different Azure services:
   - **Backend workflow**: `dotnet restore` → `dotnet build` → `dotnet test` (all 27 xUnit
     tests) → **only if every test passes**, `dotnet publish` → deploy the published output to
     Azure App Service.
   - **Frontend workflow**: `npm install` → `npm run build` (Vite bundles + type-checks) →
     deploy the `dist/` output to Azure Static Web Apps.
3. If the backend's test step fails, the workflow stops there — **the broken code never reaches
   the deploy step**, production is untouched.
4. Once deployed, the App Service restarts with the new code. If it was idle (free tier), the
   *next* incoming request after this may be slow (cold start) — normal, not a bug.
5. Configuration (JWT secret, DB connection string, `Groq__ApiKey`) is **not** part of the
   deployed code — it lives in Azure App Service's "Application settings," injected as
   environment variables at runtime. This is why the same build works differently in different
   environments without any code change: `IConfiguration` reads whichever value is present
   (env var in Azure, `appsettings.json`/user-secrets locally).

---

## Quick self-test

For each process above, try explaining it out loud in under 60 seconds, from memory, without
re-reading. If you get stuck on a step, that's exactly the part to re-read in `CODE_GUIDE.md` or
ask about again.
