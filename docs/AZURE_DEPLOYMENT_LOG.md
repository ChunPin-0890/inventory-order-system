# Azure Deployment Log

A record of the actual deployment process for this project, including every issue hit and how
it was resolved. Kept as both a personal reference and raw material for the project's Case
Study writeup — "problem → diagnosis → fix" is exactly the shape of story worth telling in
interviews.

---

## 1. Azure Account Setup

**Goal**: Get a working Azure subscription tied to a personal Microsoft account.

**Issue hit**: Signing in to [portal.azure.com](https://portal.azure.com) repeatedly failed with:
```
AADSTS50020: User account 'chunpin09@gmail.com' from identity provider 'live.com' does not
exist in tenant 'Microsoft Services' and cannot access the application '...'(Azure Portal)
in that tenant.
```
The sign-in flow was being routed through an unrelated organizational tenant ("Microsoft
Services"), not the account's own personal tenant — likely a stale cached session/tenant hint
from browser history.

**Fix**: Fully signed out of all Microsoft sessions (`login.microsoftonline.com/common/oauth2/logout`),
cleared cookies for `login.microsoftonline.com` / `login.live.com` / `portal.azure.com`, and
signed back in fresh with a manually-typed URL (no bookmarks/autofill). Resolved on the clean
retry.

**Result**: Started an Azure free trial → **$200 credit**, 30-day validity, plus 12 months of
select free services. Also enabled **MFA (two-step verification)** on the Microsoft account
before attaching any billing, via `account.microsoft.com/security`.

---

## 2. Azure SQL Database

**Goal**: Move off the in-memory EF Core provider (data wiped on every restart) onto a real,
persistent, cloud-hosted database.

### Attempt 1 — Failed: region doesn't support the free tier
Created a new SQL Server + Database with the **Free offer** (serverless, 32GB, auto-pause)
in the **Malaysia West** region. Deployment failed:
```
Error Code: ProvisioningDisabled
Error Message: Provisioning of free limit database is not supported for provided
service level objective or region
```
**Cause**: The free-tier offer is only available in a subset of Azure regions; Malaysia West
(a newer region) isn't one of them.

**Fix**: Created a **new server** (`inventory-order-system-cheong2`) in **Southeast Asia**
instead (which does support the free tier), re-selecting the Free offer / Serverless tier
there. Succeeded.

### Networking configuration
Set **Public network access → Selected networks**, and added firewall rules for:
- "Allow Azure services and resources to access this server" (needed for the future App
  Service to reach the database)
- The local machine's own client IP (needed to connect/test locally)

### Attempt 2 — Failed: server-level network override
After deploying, the backend couldn't connect at all:
```
Microsoft.Data.SqlClient.SqlException: Connection was denied because Deny Public Network
Access is set to Yes.
```
**Cause**: The SQL *server* resource has its own top-level "Public network access" setting,
separate from the firewall rules configured during database creation — those rules had not
been mirrored onto the server's own Networking blade, which still had public access effectively
denied.

**Fix**: Went to the SQL **Server** resource (not the database) → Security → Networking →
re-added both firewall rules there explicitly (client IP + `0.0.0.0`-`0.0.0.0` for Azure
services) → Saved.

### Credential storage
Copied the **ADO.NET (SQL authentication)** connection string from the database's "Connection
strings" blade. Stored it locally using:
```bash
dotnet user-secrets init
dotnet user-secrets set "ConnectionStrings:DefaultConnection" "<connection string>"
```
This keeps the password out of `appsettings.json` and therefore out of Git entirely — User
Secrets live in a file under the OS user profile, outside the project folder.

### Verification
Restarted the backend against Azure SQL: EF Core auto-created the full schema (tables,
indexes, foreign keys) via `EnsureCreated()`, seeded demo users + categories, and — critically —
**a test product created via the API survived multiple full backend restarts**, proving the
persistence problem was actually solved (previously, all data was lost on every restart with
the in-memory provider).

---

## 3. Azure App Service (backend hosting)

**Goal**: Host the .NET Web API somewhere with a public URL, not just `localhost`.

Created a Web App with:
- **Runtime**: .NET 8 (LTS)
- **OS**: Linux
- **Region**: Southeast Asia (matches the database, avoids cross-region latency)
- **Pricing tier**: **Free (F1)** — $0/month

### Application settings
Configured 6 settings under Environment Variables (App Service's equivalent of environment
variables — encrypted at rest, never touches the Git repo):

| Name | Purpose |
|---|---|
| `ConnectionStrings__DefaultConnection` | Same Azure SQL connection string as local dev |
| `Jwt__Key` | **A freshly generated production-only signing secret** (different from the local dev placeholder) |
| `Jwt__Issuer` | `InventoryOrderSystem` |
| `Jwt__Audience` | `InventoryOrderSystemClient` |
| `Jwt__ExpiryMinutes` | `120` |
| `ASPNETCORE_ENVIRONMENT` | `Production` |

Note the double-underscore (`__`) naming convention — App Service can't store `:` in a setting
name, so .NET's configuration binder treats `__` as the equivalent separator (`ConnectionStrings__DefaultConnection`
maps to `ConnectionStrings:DefaultConnection` in code without any code change needed).

---

## 4. GitHub + CI/CD

**Goal**: Push code to GitHub, and have every push to `main` automatically build, test, and
deploy to Azure — no manual deployment steps.

### Git setup
- `git init` in the project root
- Wrote a `.gitignore` excluding `node_modules/`, `bin/`/`obj/`, `.env*` files, and editor
  cruft — verified nothing sensitive (connection strings, real secrets) was staged before the
  first commit
- Created a public GitHub repo (`ChunPin-0890/inventory-order-system`)
- First `git push` failed with `remote: Invalid username or token. Password authentication is
  not supported` — GitHub no longer accepts plain passwords for git operations over HTTPS
- **Fix**: ran the push from a local terminal (not through the assistant, deliberately — auth
  tokens shouldn't pass through a third party), which triggered Git Credential Manager's
  browser-based OAuth sign-in flow. Approved in-browser, push succeeded.

### Connecting Azure to GitHub
Used the App Service's **Deployment Center**:
- Source: GitHub, Continuous Deployment (CI/CD)
- Authorized Azure's access to the GitHub account via OAuth popup
- Selected org/repo/branch (`ChunPin-0890` / `inventory-order-system` / `main`)
- **Authentication type: User-assigned identity** (OIDC-based — short-lived federated tokens,
  no long-lived secret/publish-profile sitting in the repo)

**Issue hit**: First "Save" attempt failed with **"Service unavailable"**. Retried after ~30
seconds per the portal's own suggestion — succeeded on the second attempt. (The first failed
attempt still silently created a partial/broken "Managed Identity" resource in Azure — see
below.)

### Fixing the generated workflow
Azure auto-committed `.github/workflows/main_inventory-order-system-api-cheong.yml` to the
repo. As expected, the generated `dotnet build`/`dotnet publish` steps assumed the project sat
at the repo root — but it actually lives in `backend/InventoryOrderSystem.Api/`. The first
auto-triggered run failed in ~19 seconds with a "no project file found" style error.

**Fix**: Edited the workflow directly:
- Pointed `dotnet build`/`dotnet publish` at `backend/InventoryOrderSystem.sln` /
  `backend/InventoryOrderSystem.Api/InventoryOrderSystem.Api.csproj` explicitly
- **Added a `dotnet test` step** between build and publish, so the pipeline now genuinely
  gatekeeps deployment on the 27 backend tests passing — not just "does it compile"
- Committed and pushed the fix, which auto-triggered a second run

### OIDC federated identity mismatch
The second run got past build+test successfully, but failed at the Azure login step:
```
AADSTS700213: No matching federated identity record found for presented assertion subject
'repo:ChunPin-0890/inventory-order-system:ref:refs/heads/main'
```

**Diagnosis**: Because the *first* Deployment Center save attempt had failed with "Service
unavailable" but still partially executed, there were now **three leftover "Managed Identity"**
resources in Azure (`oidc-msi-81c9`, `oidc-msi-82ce`, `oidc-msi-b583`) — one from each save
attempt. All three had the correct **Website Contributor** role assigned (checked via the App
Service's Access Control (IAM) → Role assignments), so permissions weren't the issue. Checking
each identity's own **Federated credentials** blade revealed only one (`oidc-msi-81c9`) had an
actual federated credential configured, with the exact correct subject
(`repo:ChunPin-0890/inventory-order-system:ref:refs/heads/main`) — the other two had **no**
federated credentials at all (broken/incomplete from the failed attempts). The GitHub secret
`AZUREAPPSERVICE_CLIENTID_...` that the workflow referenced, however, was pointing at one of
the *broken* identities, not the working one.

**Fix**: Copied the correct Client ID from `oidc-msi-81c9`'s Overview page, updated the
matching GitHub Actions secret (`Settings → Secrets and variables → Actions`) to that value,
then re-ran the failed job (no new push needed — GitHub Actions supports re-running a past
run's failed jobs in place).

---

## Summary of issues hit and fixed

| # | Issue | Root cause | Fix |
|---|---|---|---|
| 1 | Azure sign-in tenant mismatch (`AADSTS50020`) | Stale cached session routing through wrong tenant | Full sign-out + clean re-sign-in |
| 2 | Free-tier SQL provisioning failed (`ProvisioningDisabled`) | Free tier unavailable in Malaysia West region | Recreated server in Southeast Asia |
| 3 | Backend couldn't connect to Azure SQL at all | Server-level "Deny Public Network Access" overriding database-level firewall rules | Explicitly configured Networking on the *server* resource |
| 4 | `git push` rejected (password auth) | GitHub deprecated password auth for Git over HTTPS | Browser-based OAuth via Git Credential Manager |
| 5 | Deployment Center "Service unavailable" | Transient Azure portal backend issue | Retried after 30s per the portal's own guidance |
| 6 | First GitHub Actions run failed in 19s | Auto-generated workflow assumed project at repo root | Edited workflow to point at `backend/InventoryOrderSystem.Api/` |
| 7 | Azure login step failed (`AADSTS700213`) | GitHub secret pointed at a broken leftover Managed Identity from the earlier failed save attempt | Found the identity with a valid federated credential, updated the GitHub secret to its Client ID |

Seven distinct, non-trivial issues, each diagnosed from the actual error message rather than
guessed at — this is good material for "tell me about a time you debugged a hard production
issue" in an interview, precisely because none of it was scripted or clean.
