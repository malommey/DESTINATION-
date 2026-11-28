const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ==========================================
// THE FEDERATED SEARCH ROUTER (PHASE 2)
// ==========================================
app.get('/api/search', async (req, res) => {
    const { q, industry } = req.query;
    if (!q) return res.status(400).json({ error: "Search query required" });

    let results = [];

    try {
        switch (industry) {
            case 'tech':
                // --- FREE: GITHUB API ---
                console.log("Searching GitHub for:", q);
                const ghRes = await axios.get(`https://api.github.com/search/users?q=${encodeURIComponent(q)}&per_page=10`, {
                    headers: { 'Accept': 'application/vnd.github.v3+json' }
                });
                results = ghRes.data.items.map(user => ({
                    name: user.login,
                    platform: "GitHub",
                    profileUrl: user.html_url,
                    avatar: user.avatar_url,
                    bio: "Developer on GitHub"
                }));
                break;

            case 'food':
                // --- FREE: GOOGLE PLACES API ---
                // IMPORTANT: You need GOOGLE_PLACES_API_KEY in your Render Environment Variables
                console.log("Searching Google Places for:", q);
                if (!process.env.GOOGLE_PLACES_API_KEY) {
                    throw new Error("Google Places API key is missing.");
                }
                const gRes = await axios.get(`https://maps.googleapis.com/maps/api/place/textsearch/json`, {
                    params: { query: q, key: process.env.GOOGLE_PLACES_API_KEY }
                });
                if (gRes.data.status !== 'OK') throw new Error(gRes.data.error_message || "Google Places failed");
                
                results = gRes.data.results.map(place => ({
                    name: place.name,
                    platform: "Google Maps",
                    profileUrl: `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
                    avatar: "https://via.placeholder.com/50?text=Map", // Placeholder icon
                    bio: place.formatted_address
                }));
                break;

            case 'realestate':
                // --- FREE: OPENSTREETMAP API ---
                console.log("Searching OpenStreetMap for:", q);
                const osmRes = await axios.get(`https://nominatim.openstreetmap.org/search`, {
                    params: { q: q, format: 'json', limit: 10, addressdetails: 1 },
                    headers: { 'User-Agent': 'DestinationApp/1.0 (contact@destination.com)' } // Required by OSM
                });
                results = osmRes.data.map(place => ({
                    name: place.display_name.split(',')[0], // Just the main name
                    platform: "OpenStreetMap",
                    profileUrl: `https://www.openstreetmap.org/${place.osm_type}/${place.osm_id}`,
                    avatar: "https://via.placeholder.com/50?text=Map",
                    bio: place.display_name
                }));
                break;

            case 'b2b':
                // --- FREE: FYLINGS API (Nigerian CAC Data) ---
                // Note: You will need to sign up at fylings.com to get an API key
                console.log("Searching Fylings for:", q);
                if (!process.env.FYLINGS_API_KEY) {
                    // Fallback if you don't have the key yet
                    return res.status(200).json({ 
                        success: true, 
                        results: [{ name: "Fylings API Pending", platform: "Fylings", profileUrl: "#", avatar: "", bio: "Please add FYLINGS_API_KEY to Render" }] 
                    });
                }
                const fRes = await axios.get(`https://api.fylings.com/v1/search?q=${encodeURIComponent(q)}`, {
                    headers: { 'Authorization': `Bearer ${process.env.FYLINGS_API_KEY}` }
                });
                results = fRes.data.results.map(company => ({
                    name: company.name,
                    platform: "Fylings (CAC)",
                    profileUrl: `https://fylings.com/company/${company.id}`,
                    avatar: "https://via.placeholder.com/50?text=Biz",
                    bio: `Director: ${company.director || 'N/A'} | Status: ${company.status}`
                }));
                break;

            default:
                return res.status(400).json({ error: "Industry not supported yet." });
        }

        res.json({ success: true, count: results.length, results });

    } catch (error) {
        console.error("Search Error:", error.message);
        // Send a friendly error message to the frontend
        res.status(500).json({ error: error.message || "Search failed. Check server logs." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Destination Federated Search running on port ${PORT}`));
