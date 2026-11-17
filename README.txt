MACH SFRG EVENTS - UPDATED REPLACEMENT FILES

WHAT'S NEW
- Add an event photo (JPG, PNG, or WebP). Photos are resized before saving.
- Add an optional event sign-up / registration link.
- Each event includes Text and Email sharing actions.
- Each event includes Google Calendar and Apple Calendar options.
- The home page now includes event search and the monthly calendar.
- Removed the event-count summary cards from the home page.
- Upcoming event cards on the home page display the event photo.
- All Events continues to show both upcoming and past events.

FILES
- package.json
- server.js
- public/index.html
- public/styles.css
- public/app.js

INSTALL
1. Download and unzip this package.
2. Copy package.json and server.js into the root of your existing GitHub repository, replacing the matching files.
3. Copy the entire public folder into the root of your repository, replacing the existing public folder contents.
4. Commit and push the changes to the same GitHub repository.
5. Render should redeploy from GitHub. Keep the existing Node settings: build command `npm install`, start command `npm start`.

EXISTING EVENTS
This update keeps the same browser storage key (`mach_sfrg_events`) as the previous version. Events already saved should remain available when you open the updated app using the same browser and the same app URL. The Home page shows events dated today or later. Older/past-dated events remain available under All Events.

IMPORTANT STORAGE LIMITATION
This version still stores events and compressed photos in the browser's localStorage. That means entries are only available in the browser/device where they were added. They are not shared across users or devices. Clearing browser data can remove them. There is no login or database in this version. Do not use it for sensitive or private event information.

PHOTO STORAGE
Photos are resized to a smaller JPEG before saving. If browser storage becomes full, the app will show an error and suggest using a smaller photo or removing older event photos.

The /health endpoint returns a small JSON health check.
