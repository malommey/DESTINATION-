const express = require('express');
const cors = require('cors');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const app = express();
app.use(cors());
app.use(express.json());

// 1. Initialize Firebase Admin
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
        // We added 'budget' to the destructured request body
        const { query, platforms, caption, budget } = req.body;
        
        // Basic validation
        if (!query || !caption || !budget) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }

        // Calculate the 20% service fee
        const serviceFee = budget * 0.20;
        const adSpend = budget * 0.80;
        
        // Save to Firestore
        const docRef = await db.collection('campaigns').add({
            query,
            platforms,
            caption,
            budget: Number(budget),
            serviceFee: Number(serviceFee),
            adSpend: Number(adSpend),
            status: 'active',
            createdAt: new Date() 
        });

        res.status(200).json({ 
            success: true, 
            message: "Campaign launched to Firebase!", 
            id: docRef.id 
        });
    } catch (error) {
        console.error("Error saving to Firestore:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// 3. API Endpoint: Get Engagement Feed
app.get('/api/feed', async (req, res) => {
    try {
        // In a real app, you would fetch real engagements from Firestore
        // For now, we return a mock array so the frontend works
        res.json([
            { user: "John Doe", text: "This looks great!", platform: "Facebook" },
            { user: "Sarah M.", text: "Listened to the audio promo.", platform: "X" }
        ]);
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to load feed" });
    }
});

// 4. Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
