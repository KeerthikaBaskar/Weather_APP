require('dotenv').config();

const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

// ✅ Middleware
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'], credentials: true }));
app.use(express.json());

// ✅ Utility function: Filter fields from JSON
function filterFields(data, fields) {
  if (!fields || fields.length === 0) return data;
  const filtered = {};
  fields.forEach(field => {
    const parts = field.split('.');
    let value = data;
    for (let part of parts) {
      const match = part.match(/(\w+)\[(\d+)\]/);
      if (match) {
        const key = match[1];
        const index = parseInt(match[2]);
        value = value?.[key]?.[index];
      } else {
        value = value?.[part];
      }
      if (value === undefined) break;
    }
    if (value !== undefined) filtered[field] = value;
  });
  return filtered;
}

// ✅ Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// ✅ Universal API Proxy
app.post('/api/proxy', async (req, res) => {
  try {
    const { url, method = 'GET', headers = {}, body = null, fields = null } = req.body;

    if (!url) return res.status(400).json({ success: false, error: 'Missing required field: url' });

    const response = await axios({ method, url, headers, data: body, timeout: 10000 });
    const filteredData = fields ? filterFields(response.data, fields) : response.data;

    res.status(response.status).json({
      success: true,
      data: filteredData,
      status: response.status
    });
  } catch (error) {
    console.error('[PROXY ERROR]', error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
});

// ✅ Weather API Endpoint
app.post('/api/weather', async (req, res) => {
  try {
    const { city, fields = null } = req.body;
    if (!city) return res.status(400).json({ success: false, error: 'City name is required' });

    const API_KEY = process.env.WEATHER_API_KEY;
    if (!API_KEY) return res.status(500).json({ success: false, error: 'Missing WEATHER_API_KEY in .env' });

    console.log(`[WEATHER] Fetching data for city: ${city}`);

    const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${API_KEY}&units=metric`;
    const response = await axios.get(url);

    const filteredData = fields ? filterFields(response.data, fields) : response.data;

    res.json({
      success: true,
      city,
      data: filteredData
    });
  } catch (error) {
    console.error('[WEATHER ERROR]', error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.message || error.message
    });
  }
});

// ✅ Weather fields metadata
app.get('/api/weather/fields', (req, res) => {
  res.json({
    success: true,
    available_fields: {
      basic: ['name', 'sys.country', 'weather[0].description', 'weather[0].main'],
      temperature: ['main.temp', 'main.feels_like', 'main.temp_min', 'main.temp_max'],
      atmospheric: ['main.pressure', 'main.humidity', 'main.sea_level', 'main.grnd_level'],
      wind: ['wind.speed', 'wind.deg', 'wind.gust'],
      other: ['visibility', 'clouds.all', 'coord.lat', 'coord.lon']
    }
  });
});

// ✅ 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    available_endpoints: [
      'GET /health',
      'POST /api/proxy',
      'POST /api/weather',
      'GET /api/weather/fields'
    ]
  });
});

// ✅ IMPORTANT: For Catalyst, we must EXPORT app, not LISTEN
if (require.main === module) {
  // Running locally (node server.js)
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Local server running at http://localhost:${PORT}`);
  });
} else {
  // Running in Catalyst
  module.exports = app;
}
