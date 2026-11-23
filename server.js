const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 1. Initialize Firebase
let db;
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    initializeApp({ credential: cert(serviceAccount) });
    db = getFirestore();
    console.log("Firebase connected successfully");
} catch (error) {
    console.log("Firebase Init Error: ", error);
}

// 2. API Endpoint: Search Audience
app.get('/api/search', async (req, res) => {
    const searchTerm = req.query.q.toLowerCase();
    try {
        const snapshot = await db.collection('audience_dictionary')
                               .where('keyword', '==', searchTerm)
                               .limit(1)
                               .get();
        if (!snapshot.empty) {
            return res.json(snapshot.docs[0].data());
        } 
        let hash = 0;
        for (let i = 0; i < searchTerm.length; i++) {
            hash = searchTerm.charCodeAt(i) + ((hash << 5) - hash);
        }
        hash = Math.abs(hash);
        res.json({
            Facebook: { reach: (hash % 50000) + 5000, confidence: "High", competition: "Low" },
            "X (Twitter)": { reach: (hash % 20000) + 2000, confidence: "Medium", competition: "Medium" },
            Instagram: { reach: (hash % 15000) + 1000, confidence: "High", competition: "High" }
        });
    } catch (error) {
        res.status(500).json({ error: "Search failed" });
    }
});

// 3. API Endpoint: Generate AI Caption (Using Native Fetch!)
app.post('/api/generate-caption', async (req, res) => {
    try {
        const { imageBase64, targetAudience } = req.body;
        console.log("Received image request for audience:", targetAudience);

        if (!imageBase64) {
            return res.status(400).json({ error: "No image provided" });
        }

        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is missing in Render.");

        const base64Data = imageBase64.split(',')[1]; 
        const mimeType = imageBase64.split(';')[0].split(':')[1];

        const promptText = `You are the DESTINATION AI Co-Pilot. 
The user is trying to sell or promote something to this target audience: "${targetAudience}".
Look at the attached image. 
1. Figure out what is being sold.
2. Write a social media caption that is extremely polite, welcoming, and firm on the message.
3. Do not sound like a spam bot. Sound like a human sharing something valuable.
4. Include a placeholder for tags like [TAGS] at the end.
5. Keep it under 280 characters. Keep it natural.`;

        // --- USING NATIVE FETCH ---
        // Note: Using gemini-1.5-flash which is universally supported
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        
        const response = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: promptText },
                        { inline_data: { mime_type: mimeType, data: base64Data } }
                    ]
                }]
            })
        });

        const data = await response.json();
        
        if (data.error) {
            console.error("Gemini API Error:", data.error.message);
            throw new Error(data.error.message);
        }

        const aiText = data.candidates[0].content.parts[0].text;
        console.log("Gemini Success:", aiText);

        res.status(200).json({ success: true, caption: aiText });

    } catch (error) {
        console.error("AI Error Details:", error.message);
        res.status(500).json({ success: false, error: "Failed to generate caption." });
    }
});

// 4. API Endpoint: Verify Paystack & Launch Campaign
app.post('/api/launch', async (req, res) => {
    try {
        const { query, platforms, caption, budget, paymentRef } = req.body;
        console.log("Verifying payment for ref:", paymentRef);

        if (!paymentRef) {
            return res.status(400).json({ success: false, message: "No payment reference provided." });
        }

        // 1. VERIFY WITH PAYSTACK
        const paystackResponse = await axios.get(`https://api.paystack.co/transaction/verify/${paymentRef}`, {
            headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
        });

        const paymentData = paystackResponse.data.data;

        // 2. Ensure payment is actually successful
        if (paymentData.status !== 'success') {
            return res.status(400).json({ success: false, message: "Payment was not successful." });
        }

        // 3. Ensure amount paid matches budget
        const amountPaidInNaira = paymentData.amount / 100;
        if (amountPaidInNaira !== Number(budget)) {
            return res.status(400).json({ success: false, message: "Payment amount mismatch." });
        }

        // 4. Calculate splits and save to Firebase
        const serviceFee = budget * 0.20;
        const adSpend = budget * 0.80;
        
        const docRef = await db.collection('campaigns').add({
            query, platforms, caption,
            budget: Number(budget),
            serviceFee: Number(serviceFee),
            adSpend: Number(adSpend),
            paymentRef: paymentRef,
            status: 'active',
            createdAt: new Date() 
        });

        console.log("Campaign saved successfully to Firebase:", docRef.id);
        res.status(200).json({ success: true, id: docRef.id });

    } catch (error) {
        console.error("Payment Verification Error:", error.message);
        res.status(500).json({ success: false, message: "Payment Verification Failed" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Destination Backend running on port ${PORT}`));
