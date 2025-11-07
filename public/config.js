// const isLocal = window.location.hostname === 'localhost' || 
//                 window.location.hostname === '127.0.0.1';

// const FUNCTION_URL_BASE = isLocal 
//   ? 'http://127.0.0.1:5001/energy-monitor-aefa1/us-central1'
//   : 'https://us-central1-energy-monitor-aefa1.cloudfunctions.net';

// const FUNCTIONS = {
//   handleOAuthCallback: `${FUNCTION_URL_BASE}/handleOAuthCallback`,
//   fetchGmailMetadata: `${FUNCTION_URL_BASE}/fetchGmailMetadata`,
//   gmailPushNotification: `${FUNCTION_URL_BASE}/gmailPushNotification`
// };

// const GMAIL_REDIRECT_URI = isLocal  
//     ? 'http://localhost:5501/callback.html'
//     : 'https://energy-monitor-aefa1.web.app/callback.html';


// Detect if running locally
const isLocal = window.location.hostname === 'localhost' || 
                window.location.hostname === '127.0.0.1';

// Get the current port from the browser
const currentPort = window.location.port || (window.location.protocol === 'https:' ? 443 : 80);

// Determine if we're on the Live Server port (5501) or Functions port (5001)
const isLiveServer = currentPort === '5501' || currentPort === '5502'; // Live Server usually uses 5501-5502

// For local development, we need to know both ports
let LIVE_SERVER_PORT = '5501'; // Default Live Server port
let FUNCTIONS_PORT = '5001';   // Default Functions Emulator port

// If on Live Server, keep these defaults
// If somehow on Functions port, swap them
if (currentPort === '5001' || currentPort === '4000') {
  LIVE_SERVER_PORT = '5501';
  FUNCTIONS_PORT = '5001';
}

console.log(`🌐 Detected: hostname=${window.location.hostname}, port=${currentPort}, isLocal=${isLocal}`);

const FUNCTION_URL_BASE = isLocal 
  ? `http://127.0.0.1:${FUNCTIONS_PORT}/energy-monitor-aefa1/us-central1`
  : 'https://us-central1-energy-monitor-aefa1.cloudfunctions.net';

const GMAIL_REDIRECT_URI = isLocal  
    ? `http://localhost:${LIVE_SERVER_PORT}/callback.html`
    : 'https://energy-monitor-aefa1.web.app/callback.html';

const FUNCTIONS = {
  handleOAuthCallback: `${FUNCTION_URL_BASE}/handleOAuthCallback`,
  fetchGmailMetadata: `${FUNCTION_URL_BASE}/fetchGmailMetadata`,
  gmailPushNotification: `${FUNCTION_URL_BASE}/gmailPushNotification`
};

console.log(`✅ Config loaded:`);
console.log(`   Live Server: http://localhost:${LIVE_SERVER_PORT}`);
console.log(`   Functions: ${FUNCTION_URL_BASE}`);
console.log(`   Gmail Redirect: ${GMAIL_REDIRECT_URI}`);


//outputs
// Detected: hostname=127.0.0.1, port=5000, isLocal=true
// config.js:56 ✅ Config loaded:
// config.js:57    Live Server: http://localhost:5501
// config.js:58    Functions: http://127.0.0.1:5001/energy-monitor-aefa1/us-central1
// config.js:59    Gmail Redirect: http://localhost:5501/callback.html