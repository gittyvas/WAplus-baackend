// google-oauth-app/backend/routes/request.js

const express = require('express');
const router = express.Router();
const { OAuth2Client } = require('google-auth-library');
require('dotenv').config(); // Load env vars

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/oauth'; // Must match Google Console redirect URI

/* POST endpoint to initiate Google OAuth. */
router.post('/', async function (req, res, next) {
  try {
    const oAuth2Client = new OAuth2Client(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      REDIRECT_URI
    );

    // Generate the URL that will be used for the consent dialog
    const authorizeUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline', // Request refresh token for long-lived access
      scope: [
        // User profile info
        'openid',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/userinfo.email',

        // Contacts
        'https://www.googleapis.com/auth/contacts.readonly',
        'https://www.googleapis.com/auth/contacts.other.readonly',

        // Gmail
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/gmail.send',

        // Drive
        'https://www.googleapis.com/auth/drive.readonly',

        // Google Photos
        'https://www.googleapis.com/auth/photoslibrary.readonly'
      ],
      prompt: 'consent' // Force consent dialog every time (good for testing)
    });

    // Send the URL back to the frontend
    res.json({ url: authorizeUrl });
  } catch (error) {
    console.error('Error generating Google Auth URL:', error);
    res.status(500).json({ error: 'Failed to initiate authentication.' });
  }
});

module.exports = router;
