// functions/index.js
// Fixed Cloud Functions with proper Gmail API integration

// if (process.env.FUNCTIONS_EMULATOR ||
//  process.env.NODE_ENV !== 'production') {

//   require('dotenv').config({ path: __dirname + '/.env' });
//   console.log('✅ Loaded .env manually');
// }


require("dotenv").config();
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const {google} = require("googleapis");
const {Timestamp} = require("firebase-admin/firestore");// ADD THIS

const cors = require("cors")({origin: true});

admin.initializeApp();
const db = admin.firestore();
// // changed for  Cloud Function runtime error -> somehting with now
// const app = admin.initializeApp();
// const db = admin.firestore(app);
// version mismathc issue
// Set settings to avoid the error
db.settings({ignoreUndefinedProperties: true});

// Energy calculation constants
const ENERGY_PER_KB = 0.0003; // Wh per KB
const CO2_PER_KWH = 0.233; // kg CO2 per kWh

// ==========================================
// FUNCTION 1: Handle OAuth Callback
// ==========================================
exports.handleOAuthCallback = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    try {
      const code = req.query.code || req.body.code;
      const userId = req.query.state || req.body.userId;

      if (!code) {
        return res.status(400).json({error: "Missing authorization code"});
      }

      const oauth2Client = new google.auth.OAuth2(
          process.env.GMAIL_CLIENT_ID,
          process.env.GMAIL_CLIENT_SECRET,
          process.env.GMAIL_REDIRECT_URI,
      );

      const {tokens} = await oauth2Client.getToken(code);

      //   // Create or get user ID (use Firebase Auth or generate)


      const generatedId =
        userId || tokens.access_token.substring(0, 20);
      const userRef = db.collection("users").doc(generatedId);


      await userRef.set({
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token,
        tokenExpiry: new Date(tokens.expiry_date),
        monitoringStartTime: Timestamp.now(),
        createdAt: Timestamp.now(),
        lastSync: Timestamp.now(),
      }, {merge: true});

      const finalUserId = userRef.id;

      // Immediately fetch initial data
      await fetchAndStoreGmailData(finalUserId, tokens.access_token);
      console.log("✅ Initial data fetch completed for user:", finalUserId);

      // Setup Gmail Push Notifications
      await setupGmailWatch(finalUserId, tokens.access_token);
      console.log("✅ Gmail watch setup completed");


      res.redirect(`${req.headers.origin || "http://localhost:5000"}?userId=${finalUserId}&success=true`);
    } catch (error) {
      console.error("OAuth error:", error);
      res.status(500).json({error: error.message});
    }
  });
});

// ==========================================
// FUN2: Fetch Gmail Metadata (Manual Trigger)
// ==========================================
/**
 * Fetch Gmail metadata manually via callable function.
 * @param {object} data
 * @param {object} context
 */

exports.fetchGmailMetadata = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new
    functions.https.HttpsError("unauthenticated",
        "User not authenticated");
  }

  const userId = context.auth.uid;

  try {
    const userDoc = await db.collection("users").doc(userId).get();

    if (!userDoc.exists) {
      throw new Error("No Gmail credentials found. Please log in.");
    }

    const {refreshToken} = userDoc.data();
    const oauth2Client = new google.auth.OAuth2(
        process.env.GMAIL_CLIENT_ID,
        process.env.GMAIL_CLIENT_SECRET,
        process.env.GMAIL_REDIRECT_URI,
    );

    oauth2Client.setCredentials({refresh_token: refreshToken});
    const {credentials} = await oauth2Client.refreshAccessToken();

    await fetchAndStoreGmailData(userId, credentials.access_token);

    return {success: true, message: "Data fetched successfully"};
  } catch (error) {
    console.error("Error fetching Gmail metadata:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});

// ==========================================
// FUNCTION 3: Gmail Push Notification Handler
// ==========================================
/**
 * Fetch Gmail metadata manually via callable function.
 * @param {object} data
 * @param {object} context
 */

exports.gmailPushNotification = functions.https.onRequest(async (req, res) => {
  try {
    const message = req.body.message;

    if (!message || !message.data) {
      return res.status(400).send("Invalid notification");
    }

    const data = JSON.parse(Buffer.from(message.data, "base64").toString());
    const emailAddress = data.emailAddress;
    const historyId = data.historyId;

    // Find user by email
    const usersSnapshot = await db.collection("users")
        .where("email", "==", emailAddress)
        .limit(1)
        .get();

    if (usersSnapshot.empty) {
      console.log("User not found for email:", emailAddress);
      return res.status(200).send("OK");
    }

    const userDoc = usersSnapshot.docs[0];
    const userId = userDoc.id;
    const userData = userDoc.data();

    // Refresh access token and fetch new emails
    const oauth2Client = new google.auth.OAuth2(
        process.env.GMAIL_CLIENT_ID,
        process.env.GMAIL_CLIENT_SECRET,
        process.env.GMAIL_REDIRECT_URI,
    );

    oauth2Client.setCredentials({refresh_token: userData.refreshToken});
    const {credentials} = await oauth2Client.refreshAccessToken();

    await fetchAndStoreGmailData(userId, credentials.access_token, historyId);

    res.status(200).send("OK");
  } catch (error) {
    console.error("Push notification error:", error);
    res.status(500).send("Error");
  }
});

// ==========================================
// FUNCTION 4: Scheduled Daily Cleanup (15-day rule)
// ==========================================
/**
 * Deletes user data older than 15 days daily.
 */

exports.scheduledDailyCleanup = functions.pubsub
    .schedule("0 0 * * *") // Run at midnight UTC daily
    .timeZone("UTC")
    .onRun(async (context) => {
      try {
        const usersSnapshot = await db.collection("users").get();
        const fifteenDaysAgo = new Date();
        fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

        for (const userDoc of usersSnapshot.docs) {
          const userId = userDoc.id;

          // Delete old daily summaries (older than 15 days)
          const oldDataSnapshot = await db.collection("users").doc(userId)
              .collection("dailyData")
              .where("date", "<",
                  Timestamp.fromDate(fifteenDaysAgo))
              .get();

          const batch = db.batch();
          oldDataSnapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
          });

          if (oldDataSnapshot.size > 0) {
            await batch.commit();
            console.log(`Deleted ${oldDataSnapshot.size} 
                old records for user ${userId}`);
          }
        }

        console.log("Daily cleanup completed");
        return null;
      } catch (error) {
        console.error("Cleanup error:", error);
        return null;
      }
    });

// ==========================================
// Core Function: Fetch and Store Gmail Data
// ==========================================

/**
 * Fetches Gmail metadata, processes energy +
 * CO2, and stores in Firestore.
 * @param {string} userId
 * @param {string} accessToken
 * @param {string|null} startHistoryId
 * @return {Promise<Object>}
 */
async function fetchAndStoreGmailData(
    userId, accessToken, startHistoryId = null) {
  const oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      process.env.GMAIL_REDIRECT_URI,
  );

  oauth2Client.setCredentials({access_token: accessToken});
  const gmail = google.gmail({version: "v1", auth: oauth2Client});

  try {
    // const userDoc = await db.collection("users").doc(userId).get();
    // const userData = userDoc.data();
    // const startTime = userData.monitoringStartTime;

    const startTimestamp = Math.floor(Date.now() / 1000) - (4 * 24 * 60 * 60);
    // if (startTime.toDate) {
    //   startTimestamp = Math.floor(startTime.toDate().getTime() / 1000);
    // } else {
    //   startTimestamp = Math.floor(startTime.getTime() / 1000);
    // }

    // Get user's email address
    const profile = await gmail.users.getProfile({userId: "me"});
    const userEmail = profile.data.emailAddress;

    // Update user email
    await db.collection("users").doc(userId).update({
      email: userEmail,
    });

    // Query emails after monitoring start time
    const messageList = await gmail.users.messages.list({
      userId: "me",
      maxResults: 500,
      q: `after:${startTimestamp}`,
    });

    const messages = messageList.data.messages || [];

    // Process emails and group by date
    const dailyStats = {};

    for (const message of messages) {
      const msg = await gmail.users.messages.get({
        userId: "me",
        id: message.id,
        format: "metadata",
        metadataHeaders: ["From", "To", "Subject", "Date"],
      });

      const headers = msg.data.payload.headers || [];
      const dateHeader = headers.find((h) => h.name.toLowerCase() === "date");
      const messageDate = dateHeader ? new Date(dateHeader.value) : new Date();
      const dateKey = messageDate.toISOString().split("T")[0]; // YYYY-MM-DD

      if (!dailyStats[dateKey]) {
        dailyStats[dateKey] = {
          totalEmails: 0,
          inboxEmails: 0,
          sentEmails: 0,
          emailsWithAttachments: 0,
          totalSizeKB: 0,
          emailBodySizeKB: 0,
          attachmentSizeKB: 0,
          hourlyData: Array(24).fill(0).map(() => ({count: 0, sizeKB: 0})),
        };
      }

      const hour = messageDate.getHours();
      const sizeEstimate = msg.data.sizeEstimate || 0;
      const sizeKB = sizeEstimate / 1024;
      const hasAttachments =
       (msg.data.payload.parts || []).some(
           (p) => p.filename);

      dailyStats[dateKey].totalEmails++;
      dailyStats[dateKey].totalSizeKB += sizeKB;
      dailyStats[dateKey].emailBodySizeKB += sizeKB * 0.7;
      dailyStats[dateKey].hourlyData[hour].count++;
      dailyStats[dateKey].hourlyData[hour].sizeKB += sizeKB;

      if (hasAttachments) {
        dailyStats[dateKey].emailsWithAttachments++;
        dailyStats[dateKey].attachmentSizeKB += sizeKB * 0.3;
      }

      const labels = msg.data.labelIds || [];
      if (labels.includes("SENT")) {
        dailyStats[dateKey].sentEmails++;
      } else if (labels.includes("INBOX")) {
        dailyStats[dateKey].inboxEmails++;
      }
    }

    // Store each day's data separately
    const batch = db.batch();

    for (const [dateKey, stats] of Object.entries(dailyStats)) {
      const energy = (stats.totalSizeKB * ENERGY_PER_KB) / 1000; // kWh
      const co2 = (energy / 1000) * CO2_PER_KWH; // kg CO2

      const dayRef = db.collection("users").doc(userId)
          .collection("dailyData").doc(dateKey);

      batch.set(dayRef, {
        date: Timestamp.fromDate(new Date(dateKey)),
        ...stats,
        energyWh: energy * 1000, // Convert back to Wh for display
        co2Kg: co2,
        updatedAt: Timestamp.now(),
      }, {merge: true});
    }

    await batch.commit();

    // Update last sync time
    await db.collection("users").doc(userId).update({
      lastSync: Timestamp.now(),
    });

    console.log(`Gmail data stored for 
        user ${userId}, processed
         ${Object.keys(dailyStats).length} days`);
    return dailyStats;
  } catch (error) {
    console.error("Error processing Gmail data:", error);
    throw error;
  }
}

// ==========================================
// Helper: Setup Gmail Push Notifications
// ==========================================
/**
 * Sets up Gmail push notifications (watch) for a given user.
 * @param {string} userId
 * @param {string} accessToken
 * @return {Promise<Object|null>}
 */
async function setupGmailWatch(
    userId, accessToken) {
  try {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GMAIL_CLIENT_ID,
        process.env.GMAIL_CLIENT_SECRET,
        process.env.GMAIL_REDIRECT_URI,
    );

    oauth2Client.setCredentials({access_token: accessToken});
    const gmail = google.gmail({version: "v1", auth: oauth2Client});

    // Setup watch for the user's mailbox
    const watchResponse = await gmail.users.watch({
      userId: "me",
      requestBody: {
        topicName:
        `projects/${process.env.GCLOUD_PROJECT}/topics/gmail-notifications`,
        labelIds: ["INBOX", "SENT"],
      },
    });

    console.log("Gmail watch setup successful:", watchResponse.data);

    // Store watch details
    await db.collection("users").doc(userId).update({
      watchHistoryId: watchResponse.data.historyId,
      watchExpiration: new Date(parseInt(watchResponse.data.expiration)),
    });

    return watchResponse.data;
  } catch (error) {
    console.error("Error setting up Gmail watch:", error);
    // Non-critical error, continue without push notifications
    return null;
  }
}
