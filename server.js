// server.js (Node.js Backend)
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors()); // Allows your TrebEdit frontend to talk to this server
app.use(express.json());

// 1. Connect to Database (MongoDB)
// You will get this URL from MongoDB Atlas (free tier)
const MONGO_URI = "mongodb+srv://<username>:<password>@cluster.mongodb.net/destination";
mongoose.connect(MONGO_URI)
  .then(() => console.log("Database connected successfully"))
  .catch(err => console.log("DB Error: ", err));

// 2. Create a Database Model for Campaigns
const Campaign = mongoose.model('Campaign', new mongoose.Schema({
    query: String,
    platforms: [String],
    caption: String,
    status: { type: String, default: 'active' },
    createdAt: { type: Date, default: Date.now }
}));

// 3. API Endpoint: Launch Campaign
app.post('/api/launch', async (req, res) => {
    try {
        const { query, platforms, caption } = req.body;
        
        // Save to database
        const newCampaign = new Campaign({ query, platforms, caption });
        await newCampaign.save();

        res.status(200).json({ success: true, message: "Campaign launched to the backend!" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// 4. API Endpoint: Get Engagement Feed
app.get('/api/feed', async (req, res) => {
    // In a real app, you would fetch this from the social media APIs
    // For now, we send fake data from the backend
    res.json([
        { user: "John Doe", text: "This looks great!", platform: "Facebook" },
        { user: "Sarah M.", text: "Listened to the audio promo.", platform: "X" }
    ]);
});

// 5. Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
