That Rollup failure comes from npm’s optional-dependency bug: the package-lock.json you generated on Windows only includes the Win32 @rollup/… binaries, so when the Linux GitHub runner tried to build it couldn’t find @rollup/rollup-linux-x64-gnu. Instead of blowing away the lock, I tweaked the workflow so CI installs using npm install --prefix web (which is allowed to fetch the OS-specific optional packages) rather than npm ci. After the install, the pipeline still runs lint/test/build and deploys web/dist to the App Service. I also removed the temporary serve dependency and regenerated web/package-lock.json so the repo stays clean.
Push these changes (or rerun the updated “Frontend Pipeline”) and the build should pull the correct Rollup binary on Linux. If you see new diff in the workflow YAML or lockfile, that’s expected—go ahead and commit them.


# rerouting the UI from the api to build as one FOR NOW

Yes—serving the built React bundle from the Express API is a perfectly valid approach. It’s a common pattern when you want a single App Service to host both API and UI: the backend pipeline copies web/dist into api/dist/public, Express exposes it via express.static, and the catch-all route hands non-API requests back to index.html. This ensures the same deployment (and URL) delivers both pieces.
Benefits
One deployment artifact and one Azure Web App to track.
Your backend pipeline already builds both projects, so the workflow stays simple.
Eliminates the “default Azure page” issue, since the API now knows how to serve /.
Things to keep in mind
Because the frontend assets are bundled into the API package, every backend deploy also ships the UI. That’s fine (and often desirable), but it means UI-only changes must run through the backend pipeline too.
If you ever split frontend and backend onto separate services, you’d drop the express.static section and deploy the React app to its own static host or front-end App Service.
For now, this setup matches your goals: a manual frontend check for UI tweaks, an automatic backend pipeline that ensures both halves build, and a single App Service serving live content.