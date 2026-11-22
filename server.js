const express = require('express');
const cors = require('cors');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fetch = require('node-fetch'); // We need this to talk to Facebook

const app = express();
app.use(cors());
app.use(express.json());

// 1. Initialize Firebase Admin
let db;
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    initializeApp({ credential: cert(serviceAccount) });
    db = getFirestore();
    console.log("Firebase connected successfully");
} catch (error) {
    console.log("Firebase Init Error: ", error);
}

// 2. API Endpoint: Launch Campaign
app.post('/api/launch', async (req, res) => {
    try {
        const { query, platforms, caption, budget } = req.body;
        
        if (!query || !caption || !budget) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }

        // Calculate Budget Breakdown
        const serviceFee = budget * 0.20;
        const adSpend = budget * 0.80;
        
        // Step A: Save to Firebase Firestore
        const docRef = await db.collection('campaigns').add({
            query,
            platforms,
            caption,
            budget: Number(budget),
            serviceFee: Number(serviceFee),
            adSpend: Number(adSpend),
            status: 'pending_facebook',
            createdAt: new Date() 
        });

        // Step B: Talk to Facebook Marketing API
        // (This creates a PAUSED campaign on Facebook to prevent accidental spending)
        const FB_ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN;
        const FB_AD_ACCOUNT_ID = "act_YOUR_AD_ACCOUNT_ID"; // You will replace this later!
        
        let fbResponse = null;
        let fbSuccess = false;

        if (FB_ACCESS_TOKEN && FB_AD_ACCOUNT_ID !== "act_YOUR_AD_ACCOUNT_ID") {
            const fbUrl = `https://graph.facebook.com/v19.0/${FB_AD_ACCOUNT_ID}/campaigns`;
            
            const fbPayload = {
                name: `Dest_${query}_${Date.now()}`,
                objective: 'OUTCOME_TRAFFIC', // Standard objective for traffic
                status: 'PAUSED', // Keep it paused so it doesn't spend money instantly
                special_ad_categories: 'NONE',
                access_token: FB_ACCESS_TOKEN
            };

            try {
                const response = await fetch(fbUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(fbPayload)
                });
                
                fbResponse = await response.json();
                
                if (fbResponse.id) {
                    fbSuccess = true;
                    // Update Firebase to show it was created on Facebook
                    await docRef.update({ 
                        status: 'active_on_facebook', 
                        fbCampaignId: fbResponse.id 
                    });
                }
            } catch (fbError) {
                console.error("Facebook API Error:", fbError);
            }
        }

        res.status(200).json({ 
            success: true, 
            message: "Campaign saved!", 
            id: docRef.id,
            facebook_created: fbSuccess,
            fb_data: fbResponse
        });

    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// 3. API Endpoint: Get Engagement Feed
app.get('/api/feed', async (req, res) => {
    res.json([
        { user: "John Doe", text: "This looks great!", platform: "Facebook" },
        { user: "Sarah M.", text: "Listened to the audio promo.", platform: "X" }
    ]);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
