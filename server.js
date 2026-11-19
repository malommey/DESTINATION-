const express = require('express');
const cors = require('cors');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const app = express();
app.use(cors());
app.use(express.json());

// 1. Initialize Firebase Admin
// You will store your service account JSON in Render's Environment Variables
// See the step-by-step setup below
let db;
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    initializeApp({
        credential: cert(serviceAccount)
    });
    db = getFirestore();
    console.log("Firebase connected successfully");
} catch (error) {
    console.log("Firebase Init Error (Check your env variables): ", error);
}

// 2. API Endpoint: Launch Campaign
app.post('/api/launch', async (req, res) => {
    try {
        const { query, platforms, caption } = req.body;
        
        // Save to Firestore (using a 'campaigns' collection)
        const docRef = await db.collection('campaigns').add({
            query,
            platforms,
            caption,
            status: 'active',
            createdAt: new Date() // Firestore handles JS Dates automatically
        });

        res.status(200).json({ success: true, message: "Campaign launched to Firebase!", id: docRef.id });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// 3. API Endpoint: Get Engagement Feed
app.get('/api/feed', async (req, res) => {
    // In a real app, you would query Firestore here instead of hardcoding
    res.json([
        { user: "John Doe", text: "This looks great!", platform: "Facebook" },
        { user: "Sarah M.", text: "Listened to the audio promo.", platform: "X" }
    ]);
});

// 4. Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
