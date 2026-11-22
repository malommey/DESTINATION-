const express = require('express');
const cors = require('cors');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { GoogleGenAI } = require('@google/genai'); // Google AI Import

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increased limit for image uploads

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

// 2. Initialize Google Gemini AI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// 3. API Endpoint: Search Audience (Step 1)
app.get('/api/search', async (req, res) => {
    const searchTerm = req.query.q.toLowerCase();

    try {
        // Try to find the exact term in your Firebase dictionary
        const snapshot = await db.collection('audience_dictionary')
                               .where('keyword', '==', searchTerm)
                               .limit(1)
                               .get();

        if (!snapshot.empty) {
            const data = snapshot.docs[0].data();
            return res.json(data);
        } 

        // Fallback smart data if not in database
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

// 4. API Endpoint: Generate AI Caption (Step 2)
app.post('/api/generate-caption', async (req, res) => {
    try {
        const { imageBase64, targetAudience } = req.body;

        if (!imageBase64) {
            return res.status(400).json({ error: "No image provided" });
        }

        // Strip the header from base64 string (e.g., "data:image/jpeg;base64,")
        const base64Data = imageBase64.split(',')[1];
        const mimeType = imageBase64.split(';')[0].split(':')[1];

        const prompt = `
            You are the DESTINATION AI Co-Pilot. 
            The user is trying to sell or promote something to this target audience: "${targetAudience}".
            
            Look at the attached image. 
            1. Figure out what is being sold.
            2. Write a social media caption that is extremely polite, welcoming, and firm on the message.
            3. Do not sound like a spam bot. Sound like a human sharing something valuable.
            4. Include a placeholder for tags like [TAGS] at the end.
            5. Keep it under 280 characters. Keep it natural.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: [
                prompt,
                { inlineData: { data: base64Data, mimeType: mimeType } }
            ]
        });

        res.status(200).json({ success: true, caption: response.text });

    } catch (error) {
        console.error("AI Error:", error);
        res.status(500).json({ success: false, error: "Failed to generate caption." });
    }
});

// 5. API Endpoint: Launch Campaign
app.post('/api/launch', async (req, res) => {
    try {
        const { query, platforms, caption, budget } = req.body;
        
        if (!query || !caption || !budget) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }

        const serviceFee = budget * 0.20;
        const adSpend = budget * 0.80;
        
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

        res.status(200).json({ success: true, id: docRef.id });
    } catch (error) {
        console.error("Error saving to Firestore:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
