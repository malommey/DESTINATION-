const express = require('express');
const cors = require('cors');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const sharp = require('sharp');

const app = express();

// 1. EXPLICIT CORS CONFIGURATION
app.use(cors({
    origin: 'https://rad-caramel-da0bd5.netlify.app', // Your exact Netlify URL
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json({ limit: '10mb' }));

// 2. Initialize Firebase Admin
let db;
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    initializeApp({ credential: cert(serviceAccount) });
    db = getFirestore();
    console.log("Firebase connected successfully");
} catch (error) {
    console.log("Firebase Init Error: ", error);
}

// 3. Initialize Google Gemini AI (Using the stable model)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); // CHANGED TO STABLE MODEL

// 4. API Endpoint: Search Audience
app.get('/api/search', async (req, res) => {
    const searchTerm = req.query.q.toLowerCase();

    try {
        const snapshot = await db.collection('audience_dictionary')
                               .where('keyword', '==', searchTerm)
                               .limit(1)
                               .get();

        if (!snapshot.empty) {
            const data = snapshot.docs[0].data();
            return res.json(data);
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

// 5. API Endpoint: Generate AI Caption
app.post('/api/generate-caption', async (req, res) => {
    try {
        const { imageBase64, targetAudience } = req.body;
        console.log("Received image request for audience:", targetAudience); // Debug log

        if (!imageBase64) {
            return res.status(400).json({ error: "No image provided" });
        }

        // Clean the Base64 string
        const parts = imageBase64.split(',');
        const mimeType = parts[0].match(/:(.*?);/)[1];
        const base64Data = parts[1];

        // Compress the image
        const imageBuffer = Buffer.from(base64Data, 'base64');
        const compressedBuffer = await sharp(imageBuffer)
            .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer();
        const cleanBase64 = compressedBuffer.toString('base64');

        const prompt = `You are the DESTINATION AI Co-Pilot. 
The user is trying to sell or promote something to this target audience: "${targetAudience}".
Look at the attached image. 
1. Figure out what is being sold.
2. Write a social media caption that is extremely polite, welcoming, and firm on the message.
3. Do not sound like a spam bot. Sound like a human sharing something valuable.
4. Include a placeholder for tags like [TAGS] at the end.
5. Keep it under 280 characters. Keep it natural.`;

        console.log("Sending to Gemini..."); // Debug log

        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    data: cleanBase64,
                    mimeType: "image/jpeg"
                }
            }
        ]);

        const responseText = result.response.text();
        console.log("Gemini Response:", responseText); // Debug log

        res.status(200).json({ success: true, caption: responseText });

    } catch (error) {
        console.error("AI Error Details:", error);
        res.status(500).json({ success: false, error: "Failed to generate caption." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
