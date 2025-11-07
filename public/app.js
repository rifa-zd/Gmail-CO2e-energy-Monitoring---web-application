// public/app.js - Updated Frontend

// Firebase config
const firebaseConfig = {
    apiKey: "AIzaSyCu190iNxB97f820nLBmrE8jhLikpuJKtY",
    authDomain: "energy-monitor-aefa1.firebaseapp.com",
    projectId: "energy-monitor-aefa1",
    storageBucket: "energy-monitor-aefa1.firebasestorage.app",
    messagingSenderId: "31604458825",
    appId: "1:31604458825:web:717b5cf7215b7aafedc698"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Gmail OAuth Configuration
const GMAIL_CLIENT_ID = "631165850383-2c6cvg3l2qt2nijj4jtt5r4uflni61up.apps.googleusercontent.com";
const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

// Energy constants
const ENERGY_PER_KB = 0.0003;
const CO2_PER_KWH = 0.233;

// DOM Elements
const authSection = document.getElementById("authSection");
const dashboard = document.getElementById("dashboard");
const loginBtn = document.getElementById("loginBtn");
const refreshBtn = document.getElementById("refreshBtn");
const exportBtn = document.getElementById("exportBtn");
const clearBtn = document.getElementById("clearBtn");
const loading = document.getElementById("loading");
const content = document.getElementById("content");

let currentUserId = null;

// Event Listeners
loginBtn.addEventListener("click", initiateGmailOAuth);
refreshBtn.addEventListener("click", refreshData);
exportBtn.addEventListener("click", exportData);
clearBtn.addEventListener("click", clearAllData);

// Check URL parameters for userId
window.addEventListener('load', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get('userId');
    const success = urlParams.get('success');
    
    if (userId && success === 'true') {
        currentUserId = userId;
        localStorage.setItem('gmailMonitorUserId', userId);
        window.history.replaceState({}, document.title, window.location.pathname);
        showDashboard();
        loadUserData();
    } else {
        const storedUserId = localStorage.getItem('gmailMonitorUserId');
        if (storedUserId) {
            currentUserId = storedUserId;
            checkUserExists(storedUserId);
        } else {
            showAuthSection();
        }
    }
});

async function checkUserExists(userId) {
    try {
        const userDoc = await db.collection("users").doc(userId).get();
        if (userDoc.exists) {
            showDashboard();
            loadUserData();
        } else {
            localStorage.removeItem('gmailMonitorUserId');
            showAuthSection();
        }
    } catch (error) {
        console.error("Error checking user:", error);
        showAuthSection();
    }
}

function initiateGmailOAuth() {
    const state = 'user_' + Date.now();
    localStorage.setItem('oauth_state', state);
    
    const params = new URLSearchParams({
        client_id: GMAIL_CLIENT_ID,
        redirect_uri: GMAIL_REDIRECT_URI,
        response_type: "code",
        scope: GMAIL_SCOPES.join(" "),
        access_type: "offline",
        prompt: "consent",
        state: state
    });

    console.log("Redirect URI being used:", GMAIL_REDIRECT_URI); // <--- Add this

    
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

function showAuthSection() {
    authSection.style.display = "block";
    dashboard.style.display = "none";
}

function showDashboard() {
    authSection.style.display = "none";
    dashboard.style.display = "block";
}

async function loadUserData() {
    loading.style.display = "block";
    content.style.display = "none";

    try {
        const fifteenDaysAgo = new Date();
        fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
        
        const dailyDataSnapshot = await db.collection("users")
            .doc(currentUserId)
            .collection("dailyData")
            .where("date", ">=", firebase.firestore.Timestamp.fromDate(fifteenDaysAgo))
            .orderBy("date", "asc")
            .get();

        //  if (dailyDataSnapshot.empty) {
        //     content.innerHTML = `
        //         <div style="text-align: center; padding: 40px;">
        //             <h2>No data available yet</h2>
        //             <p>Your Gmail monitoring has started. Data will appear as emails are processed.</p>
        //             <button onclick="refreshData()" style="margin-top: 20px; padding: 10px 20px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer;">
        //                 Fetch Data Now
        //             </button>
        //         </div>
        //     `;
        //     loading.style.display = "none";
        //     content.style.display = "block";
        //     return;
        // }

        const dailyData = [];
        dailyDataSnapshot.forEach(doc => {
            dailyData.push({ id: doc.id, ...doc.data() });
        });

        displayMetrics(dailyData);
        generateCharts(dailyData);
        generateTips(dailyData);

        loading.style.display = "none";
        content.style.display = "block";
    } catch (error) {
        console.error("Error loading data:", error);
        loading.style.display = "none";
        content.innerHTML = `<p style="color: red; text-align: center; padding: 40px;">Error loading data: ${error.message}</p>`;
        content.style.display = "block";
    }
}

async function refreshData() {
    refreshBtn.disabled = true;
    refreshBtn.textContent = "Refreshing...";
    
    try {
        // This would typically call a Cloud Function, but we'll reload data
        await loadUserData();
        refreshBtn.textContent = "✓ Refreshed";
        setTimeout(() => {
            refreshBtn.textContent = "Refresh Data";
            refreshBtn.disabled = false;
        }, 2000);
    } catch (error) {
        console.error("Refresh error:", error);
        alert("Failed to refresh data");
        refreshBtn.textContent = "Refresh Data";
        refreshBtn.disabled = false;
    }
}

async function exportData() {
    try {
        const fifteenDaysAgo = new Date();
        fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
        
        const snapshot = await db.collection("users")
            .doc(currentUserId)
            .collection("dailyData")
            .where("date", ">=", firebase.firestore.Timestamp.fromDate(fifteenDaysAgo))
            .orderBy("date", "asc")
            .get();

        if (snapshot.empty) {
            alert("No data to export");
            return;
        }

        // CSV headers
        let csv = "Date,Total Emails,Inbox Emails,Sent Emails,Emails with Attachments,Total Size (KB),Email Body Size (KB),Attachment Size (KB),Energy (Wh),CO2 (kg)\n";
        
        snapshot.forEach(doc => {
            const data = doc.data();
            csv += `${doc.id},${data.totalEmails || 0},${data.inboxEmails || 0},${data.sentEmails || 0},${data.emailsWithAttachments || 0},${(data.totalSizeKB || 0).toFixed(2)},${(data.emailBodySizeKB || 0).toFixed(2)},${(data.attachmentSizeKB || 0).toFixed(2)},${(data.energyWh || 0).toFixed(4)},${(data.co2Kg || 0).toFixed(6)}\n`;
        });

        // Download CSV
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gmail-energy-data-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
        
        alert("Data exported successfully!");
    } catch (error) {
        console.error("Export error:", error);
        alert("Failed to export data: " + error.message);
    }
}

async function clearAllData() {
    if (!confirm("This will export your data and then permanently delete all records. Continue?")) {
        return;
    }

    try {
        // Export first
        await exportData();
        
        // Delete all dailyData
        const snapshot = await db.collection("users")
            .doc(currentUserId)
            .collection("dailyData")
            .get();

        const batch = db.batch();
        snapshot.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();

        // Delete user document
        await db.collection("users").doc(currentUserId).delete();
        
        // Clear localStorage
        localStorage.removeItem('gmailMonitorUserId');
        currentUserId = null;
        
        alert("All data cleared successfully!");
        showAuthSection();
    } catch (error) {
        console.error("Clear data error:", error);
        alert("Failed to clear data: " + error.message);
    }
}

function displayMetrics(dailyData) {
    let totalEnergy = 0, totalCO2 = 0, totalEmails = 0, totalData = 0;
    let inboxCount = 0, sentCount = 0, attachmentCount = 0;
    let emailBodySize = 0, attachmentSize = 0;

    dailyData.forEach(day => {
        totalEnergy += day.energyWh || 0;
        totalCO2 += day.co2Kg || 0;
        totalEmails += day.totalEmails || 0;
        totalData += day.totalSizeKB || 0;
        inboxCount += day.inboxEmails || 0;
        sentCount += day.sentEmails || 0;
        attachmentCount += day.emailsWithAttachments || 0;
        emailBodySize += day.emailBodySizeKB || 0;
        attachmentSize += day.attachmentSizeKB || 0;
    });

    document.getElementById("totalEnergy").textContent = totalEnergy.toFixed(2);
    document.getElementById("totalCO2").textContent = totalCO2.toFixed(4);
    document.getElementById("emailCount").textContent = totalEmails.toLocaleString();
    document.getElementById("totalData").textContent = (totalData / 1024).toFixed(2);

    document.getElementById("inboxCount").textContent = inboxCount.toLocaleString();
    document.getElementById("sentCount").textContent = sentCount.toLocaleString();
    document.getElementById("attachmentCount").textContent = attachmentCount.toLocaleString();

    document.getElementById("emailBodySize").textContent = (emailBodySize / 1024).toFixed(2);
    document.getElementById("attachmentSize").textContent = (attachmentSize / 1024).toFixed(2);
    document.getElementById("avgEmailSize").textContent = totalEmails > 0 ? (totalData / totalEmails).toFixed(2) : "0";

    const lastUpdate = dailyData.length > 0 ? new Date(dailyData[dailyData.length - 1].updatedAt.toDate()).toLocaleString() : "Never";
    document.getElementById("lastSync").textContent = lastUpdate;
}

function generateCharts(dailyData) {
    const today = new Date().toISOString().split('T')[0];
    const todayData = dailyData.find(d => d.id === today);

    // 24-Hour Charts
    const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`);
    let energyByHour = Array(24).fill(0);
    let co2ByHour = Array(24).fill(0);

    if (todayData && todayData.hourlyData) {
        energyByHour = todayData.hourlyData.map(h => ((h.sizeKB * ENERGY_PER_KB) / 1000) * 1000);
        co2ByHour = energyByHour.map(e => ((e / 1000) / 1000) * CO2_PER_KWH);
    }

    const ctx1 = document.getElementById("hourlyEnergyChart").getContext("2d");
    if (window.hourlyEnergyChart) window.hourlyEnergyChart.destroy();
    window.hourlyEnergyChart = new Chart(ctx1, {
        type: "line",
        data: {
            labels: hours,
            datasets: [{
                label: "Energy (Wh)",
                data: energyByHour,
                borderColor: "#51cf66",
                backgroundColor: "rgba(81, 207, 102, 0.1)",
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: true } },
            scales: { y: { beginAtZero: true } }
        }
    });

    const ctx2 = document.getElementById("hourlyCO2Chart").getContext("2d");
    if (window.hourlyCO2Chart) window.hourlyCO2Chart.destroy();
    window.hourlyCO2Chart = new Chart(ctx2, {
        type: "line",
        data: {
            labels: hours,
            datasets: [{
                label: "CO2 (kg)",
                data: co2ByHour,
                borderColor: "#51cf66",
                backgroundColor: "rgba(81, 207, 102, 0.1)",
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: true } },
            scales: { y: { beginAtZero: true } }
        }
    });

    // 15-Day Charts
    const dates = dailyData.length > 0 ? dailyData.map(d => d.id) : ["No data"];
    const energyByDay = dailyData.length > 0 ? dailyData.map(d => d.energyWh || 0) : [0];
    const co2ByDay = dailyData.length > 0 ? dailyData.map(d => d.co2Kg || 0) : [0];

    const ctx3 = document.getElementById("dailyEnergyChart").getContext("2d");
    if (window.dailyEnergyChart) window.dailyEnergyChart.destroy();
    window.dailyEnergyChart = new Chart(ctx3, {
        type: "bar",
        data: {
            labels: dates,
            datasets: [{
                label: "Energy (Wh)",
                data: energyByDay,
                backgroundColor: "#51cf66"
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: true } },
            scales: { y: { beginAtZero: true } }
        }
    });

    const ctx4 = document.getElementById("dailyCO2Chart").getContext("2d");
    if (window.dailyCO2Chart) window.dailyCO2Chart.destroy();
    window.dailyCO2Chart = new Chart(ctx4, {
        type: "bar",
        data: {
            labels: dates,
            datasets: [{
                label: "CO2 (kg)",
                data: co2ByDay,
                backgroundColor: "#51cf66"
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: true } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

function generateTips(dailyData) {
    if (dailyData.length === 0) {
        document.getElementById("tipsList").innerHTML = `
            <div class="tip-item">📊 No data available yet. Send or receive some emails to get personalized tips!</div>
            <div class="tip-item">💡 General tip: Delete old emails regularly to reduce server storage energy.</div>
            <div class="tip-item">🔋 Sending emails during off-peak hours can use renewable energy sources.</div>
        `;
        return;
    }

    const tips = [];
    const totalEmails = dailyData.reduce((sum, d) => sum + (d.totalEmails || 0), 0);
    const totalAttachments = dailyData.reduce((sum, d) => sum + (d.emailsWithAttachments || 0), 0);
    const totalSize = dailyData.reduce((sum, d) => sum + (d.totalSizeKB || 0), 0);
    const attachmentSize = dailyData.reduce((sum, d) => sum + (d.attachmentSizeKB || 0), 0);
    const bodySize = dailyData.reduce((sum, d) => sum + (d.emailBodySizeKB || 0), 0);
    
    const avgEmailSize = totalEmails > 0 ? totalSize / totalEmails : 0;
    const attachmentRatio = totalEmails > 0 ? totalAttachments / totalEmails : 0;

    if (attachmentRatio > 0.3) {
        tips.push("📎 Over 30% of your emails have attachments. Consider using cloud storage links (Google Drive, Dropbox) to reduce energy consumption.");
    }

    if (attachmentSize > bodySize * 1.5) {
        tips.push("📤 Attachments consume more energy than email content. Compress files before sending or use file sharing services.");
    }

    if (avgEmailSize > 500) {
        tips.push("📝 Your average email size is large (>500KB). Keep messages concise and avoid embedding large images.");
    }

    const sentEmails = dailyData.reduce((sum, d) => sum + (d.sentEmails || 0), 0);
    const inboxEmails = dailyData.reduce((sum, d) => sum + (d.inboxEmails || 0), 0);
    
    if (sentEmails > inboxEmails * 1.5) {
        tips.push("✉️ You send significantly more emails than you receive. Consider batching communications or using instant messaging for quick updates.");
    }

    if (totalEmails > 100 * dailyData.length) {
        tips.push("📧 High email volume detected. Unsubscribe from newsletters you don't read and use email filters to reduce clutter.");
    }

    if (tips.length === 0) {
        tips.push("🌱 Excellent! Your email usage is energy-efficient. Keep up the good work!");
    }

    tips.push("💡 Delete old emails regularly to reduce server storage energy.");
    tips.push("🔋 Sending emails during off-peak hours can use renewable energy sources.");

    const tipsHtml = tips.map(tip => `<div class="tip-item">${tip}</div>`).join("");
    document.getElementById("tipsList").innerHTML = tipsHtml;
}