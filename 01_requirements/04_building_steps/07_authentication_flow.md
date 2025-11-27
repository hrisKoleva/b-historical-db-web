# Step 7 – Authentication Flow (Azure AD)

## Let Azure deals with it
Yes—there’s a much lighter option: let Azure App Service handle the Azure AD login for you (“Easy Auth”). That sits in front of **every** request (HTML, JS, API) and forces the Microsoft login screen before anything loads, so you don’t have to wire MSAL or JWT validation in code right away.

### How to do it

1. **Open the Web App in the Azure Portal**  
   Go to your App Service → *Authentication*.

2. **Enable App Service Authentication**  
   Toggle Authentication to *On*, and set “Unauthenticated requests” to **HTTP 302: Redirect to provider**. That alone makes Azure AD the gatekeeper—any hit to `/` or `/api/*` bounces to the login page.

3. **Add Microsoft Entra ID as the provider**  
   - Choose “Add identity provider.”  
   - Under “Microsoft,” select “Create new app registration” (or point to your existing one).  
   - Leave the default callback URL (the portal fills this in).  
   - Save. On the next page hit **Save** again so the new configuration applies.

4. **Limit access to the right group**  
   - In the Azure AD app registration that was created, open *Properties* and set “Assignment required” to **Yes**.  
   - Assign only the security group that should have access. Members of that group (or individually assigned users) are the only people who can sign in.  
   - Everyone else gets blocked before they reach your app.

That’s it. The entire site is now “hidden” behind the Azure login you’re used to seeing, without touching the code. When someone opens the URL or calls `/api/customers`, Azure App Service redirects them to sign in, drops an auth cookie, then forwards the request to your Express app. The UI will load and make API calls without extra prompts because they share that same cookie.


## When you might still add custom code later
- If you want the backend to verify specific roles/claims or call downstream APIs with the user’s token, you’ll eventually parse the `X-MS-CLIENT-PRINCIPAL` header or request an access token.  
- If you decide to host the frontend separately or need cross-origin scenarios, MSAL might come back into the picture.

But for the immediate goal— “require login for the whole site and protect the API” —App Service Authentication is the fastest, least scary route. Let me know when you’ve enabled it or if you want me to walk through the portal with you.

With App Service Authentication switched on, here’s exactly what your users will see:

1. **First visit to the site**  
   - They browse to `https://upklinge-hdb.azurewebsites.net/`.  
   - Instead of the app loading, Azure immediately sends them to the Microsoft sign-in screen (company-branded login).  
   - They enter their work email/password (and MFA if required).  
   - Once OK, Azure redirects them back to the home page. The React UI renders normally, and they can search customers, etc.

2. **Subsequent actions in the app**  
   - The browser now holds an App Service auth cookie. Every request (UI assets, API calls) automatically includes that cookie.  
   - Clicking “Search” (or any other API call) goes straight through—no additional prompts. Azure App Service has already authenticated them and set the `X-MS-CLIENT-PRINCIPAL` header that identifies the user to your API.

3. **Direct API call in the browser**  
   - If they type `https://upklinge-hdb.azurewebsites.net/api/customers?...` directly, the same cookie is used. If they’re already signed in, the JSON response appears. If not, they’re bounced to the Microsoft login page first.

4. **Unauthorized users**  
   - If someone outside the allowed Azure AD security group tries the URL, they’ll either see an Access Denied message or get stuck at “You do not have access to this application,” depending on how the app registration is configured. They never reach your UI or API.

5. **Session lifetime / sign-out**  
   - Authentication lasts as long as the cookie and their Azure session. Closing the browser usually keeps the cookie; they’ll go straight into the app next time until the token expires or they sign out (in Azure portal or the app registration).  
   - If you want a manual sign-out button later, we can add one that clears the cookie and calls Azure’s logout endpoint.

So the “roll-out” experience for your users is: browse → Microsoft login → your app. No code changes they can see, no multi-step prompts, and the API is protected by the same login automatically.


# AUTHENTICATION CONFIGURATION
No worries—those errors just mean the portal couldn’t create a brand‑new app registration on your behalf because your account lacks the necessary directory rights. The fix is to point App Service at an app registration that already exists (or one you create yourself in Azure AD) and supply its details.

### What to do:

1. **Create or reuse an app registration manually**
   - Go to **Azure Active Directory → App registrations → New registration**.
   - Name it (`historical-db-web-auth` or similar) and make it **Single tenant**.
   - In **Authentication**, add redirect URIs:
     - `https://upklinge-hdb.azurewebsites.net/.auth/login/aad/callback`
     - Add `https://upklinge-hdb.azurewebsites.net/.auth/login/done` if the portal suggests it.
   - Under **Certificates & secrets**, create a client secret and copy the value (you’ll paste it into App Service in a moment).
   - Optional but recommended: in **Enterprise applications**, set **Assignment required** to **Yes** and assign the security group.

2. **Back to App Service → Authentication**
   - Click **Add identity provider** → Microsoft.
   - Choose **Workforce configuration (current tenant)**.
   - For app registration, pick **Provide the details of an existing app registration**.
   - Enter:
     - Client ID (Application ID from the registration)
     - Tenant-specific issuer (e.g. `https://login.microsoftonline.com/<tenant-id>/v2.0`)
     - Client secret (paste the value you just copied)
   - Set the rest of the options as discussed (client requirement = “this app itself”, identity requirement = any identity, tenant requirement = only issuer tenant).
   - Save.

Once you use an existing registration and supply the secret, the identity provider should add successfully, and Azure will start enforcing the sign-in before anyone reaches the app or API.

# Engineering Implementation

## Objectives
- Require Azure AD sign-in **before** anyone can use the web app UI.
- Use the same Azure AD session to call the backend API; no secondary login prompts for in-app actions.
- Block direct `/api/*` access from unauthenticated/non-authorised users (return 401/403).
- Restrict access to members of the existing Azure AD security group that already has rights on the resource group.
- Keep deployment friction low (continue using the current API + frontend workflow).

## High-Level Design
1. **Azure AD App Registrations**
   - **Frontend SPA registration**  
     - Single-page application platform with redirect URI `https://<web-app-host>/auth/callback` (plus local `http://localhost:5173/auth/callback` for dev).  
     - Expose delegated permission scope for the API (e.g. `api://<api-app-id>/HistoricalDb.Read`).
   - **Backend/API registration** (existing or new)  
     - Accepts access tokens issued to the SPA registration.  
     - Configured with the required delegated scopes and allowed groups.
   - **Security group restriction**  
     - Collect the Azure AD group object ID and store it in configuration so the backend can enforce membership.

2. **Frontend (React / Vite)**
   - Add MSAL React (`@azure/msal-browser` + `@azure/msal-react`) for authentication.  
   - Initialise MSAL with tenant ID, client ID, redirect URIs, cache settings (localStorage), and required scopes.
   - Wrap the app in `MsalProvider`; add a login guard component that triggers `loginRedirect` when no account is active.
   - On successful sign-in, acquire an access token (`acquireTokenSilent`) for the API scope and attach it as a `Bearer` token header on all `fetch` calls.
   - Handle token refresh silently (MSAL manages refresh under the hood).
   - Log out button should call `logoutRedirect` to clear the session.

3. **Backend (Express)**
   - Use `passport-azure-ad` (bearer strategy) or `express-oauth2-jwt-bearer` with jwks caching to validate tokens on each `/api/*` request.  
     - Validate audience (API app ID URI), issuer (tenant), and ensure tokens contain the required scope.  
     - Check the `groups` claim (or use Graph call if groups claim isn’t present) to confirm membership in the authorised group.  
     - Reject requests with 401/403 when validation fails.
   - Since the frontend now serves from the API, add middleware before route handlers:
     ```ts
     app.use('/api', azureAdBearerMiddleware);
     ```
   - Store configuration via environment variables:
     ```
     AZURE_TENANT_ID=
     AZURE_CLIENT_ID=          # API application (audience)
     AZURE_ALLOWED_GROUP_ID=   # Security group Object ID
     AZURE_ALLOWED_SCOPE=      # Optional: explicit scope string
     ```

4. **Local Development Flow**
   - Create `.env` entries for both frontend and backend with the same tenant/client IDs (using dev redirect URIs).  
   - Run `npm run dev --prefix api` and `npm run dev --prefix web`; MSAL will prompt for login once in the browser and tokens will be forwarded automatically.

5. **CI/CD Adjustments**
   - Update GitHub Action secrets to include:  
     `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_ALLOWED_GROUP_ID`, and any scopes.  
   - Ensure the backend pipeline publishes these secrets into the App Service configuration (either via `appsettings` or the publish profile) so Express has them at runtime.  
   - The manual frontend pipeline only needs the public MSAL settings (tenant & SPA client ID) if we ever redeploy static assets separately.

## Open Questions / Action Items
1. Confirm whether we have separate SPA/API app registrations or a single unified registration (some teams prefer one app with both SPA + Web/API redirect URIs).  
2. Determine the authorised Azure AD group object ID and whether multiple groups should be supported.  
3. Decide on token validation library (Passport bearer strategy vs. `@azure/msal-node` vs. `express-oauth2-jwt-bearer`).  
4. Decide how to surface “unauthorised” errors in the UI (e.g. friendly message vs. forcing logout).  
5. Add documentation for ops covering required Azure App Service configuration and secret management.

Once the above items are clarified, implementation will proceed with:
- Frontend MSAL integration (new provider/guard + HTTP client).  
- Backend JWT middleware + group check.  
- CI/CD secret updates and smoke tests (manual and automated).


