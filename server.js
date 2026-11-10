const express = require('express');
const path = require('path');
const crypto = require('crypto');
const app = express();
const PORT = process.env.PORT || 80;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1. THE STAFF ACCESS ROSTER (Add or delete official emails here)
let authorizedRoster = [
  'michael.arthur.mil@health.mil',
  'test.user@health.mil'
];

let activeSessions = new Map(); 

// 2. ROUTE: INCOMING LOGIN REQUEST
app.post('/api/auth/login', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: 'Email required.' });
  
  const cleanEmail = email.trim().toLowerCase();

  if (!authorizedRoster.includes(cleanEmail)) {
    return res.status(403).json({ success: false, message: 'Access Denied: Email is not authorized.' });
  }

  const verificationPin = Math.floor(100000 + Math.random() * 900000).toString();
  console.log(`\n[SECURITY ALERT] Pin ${verificationPin} generated for: ${cleanEmail}\n`);
  
  activeSessions.set(cleanEmail, { pin: verificationPin, attempts: 0 });
  res.json({ success: true, message: 'Verification pin processed successfully.' });
});

// 3. ROUTE: VERIFY PIN CODE
app.post('/api/auth/verify', (req, res) => {
  const { email, pin } = req.body;
  if (!email || !pin) return res.status(400).json({ success: false, message: 'Missing parameters.' });

  const cleanEmail = email.trim().toLowerCase();
  const sessionData = activeSessions.get(cleanEmail);

  if (sessionData && sessionData.pin === pin.trim()) {
    const secureToken = crypto.randomBytes(32).toString('hex');
    activeSessions.set(secureToken, cleanEmail);
    activeSessions.delete(cleanEmail); 

    return res.json({ success: true, token: secureToken });
  }

  res.status(401).json({ success: false, message: 'Invalid verification pin code.' });
});

// 4. ROUTE: SECURE CALENDAR FETCH GATE
app.get('/api/calendar/stream', (req, res) => {
  const userToken = req.headers['authorization'];
  const matchedEmail = activeSessions.get(userToken);

  if (!matchedEmail || !authorizedRoster.includes(matchedEmail)) {
    if (userToken) activeSessions.delete(userToken); 
    return res.status(403).json({ success: false, message: 'Session Revoked: Account no longer active on roster.' });
  }

  res.json({ success: true, user: matchedEmail, status: "Authenticated" });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Gatekeeper server container running cleanly on port ${PORT}`);
});
