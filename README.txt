MACH SFRG EVENTS - REPLACEMENT FILES

FILES IN THIS PACKAGE
- package.json
- server.js
- public/index.html
- public/styles.css
- public/app.js

HOW TO INSTALL
1. Download and unzip this package.
2. In your existing GitHub repository, replace the matching files with these files.
3. Keep the public folder and put index.html, styles.css, and app.js inside it.
4. Commit the changes and push them to the same GitHub repository.
5. Render should redeploy from GitHub. The Render service should use the Node runtime,
   build command `npm install`, and start command `npm start`.

IMPORTANT STORAGE NOTE
This version stores events in the browser's localStorage. Events are saved only in the
browser/device where they were entered. They are not shared across users or devices,
and clearing browser data can remove them. There is no login or database in this
starter version. Do not use it for sensitive or private event information.

The /health endpoint returns a small JSON health check.
