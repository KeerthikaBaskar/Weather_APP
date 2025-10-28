require('dotenv').config();

const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware - CORS configuration for separate frontend folder
app.use(cors({
  origin: '*', // Allow requests from any origin
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
app.use(express.json());

// Utility function to filter object by selected fields
function filterFields(data, fields) {
  if (!fields || fields.length === 0) {
    return data;
  }

  const filtered = {};
  
  fields.forEach(field => {
    // Support nested fields like "main.temp" or "weather[0].description"
    const parts = field.split('.');
    let value = data;
    
    for (let part of parts) {
      // Handle array notation like "weather[0]"
      const arrayMatch = part.match(/(\w+)\[(\d+)\]/);
      if (arrayMatch) {
        const key = arrayMatch[1];
        const index = parseInt(arrayMatch[2]);
        value = value?.[key]?.[index];
      } else {
        value = value?.[part];
      }
      
      if (value === undefined) break;
    }
    
    if (value !== undefined) {
      filtered[field] = value;
    }
  });
  
  return filtered;
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Universal API Proxy with field filtering
app.post('/api/proxy', async (req, res) => {
  try {
    const { 
      url, 
      method = 'GET', 
      headers = {}, 
      body = null,
      fields = null // Optional: array of fields to return
    } = req.body;

    if (!url) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required field: url' 
      });
    }

    console.log(`[PROXY] ${method} ${url}`);

    // Make request to third-party API
    const response = await axios({
      method: method,
      url: url,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      data: body,
      timeout: 10000
    });

    // Filter response data if fields are specified
    const filteredData = fields 
      ? filterFields(response.data, fields)
      : response.data;

    res.status(response.status).json({
      success: true,
      data: filteredData,
      status: response.status,
      fields_requested: fields || 'all'
    });

  } catch (error) {
    console.error('[PROXY ERROR]:', error.message);
    
    if (error.response) {
      res.status(error.response.status).json({
        success: false,
        error: error.response.data,
        status: error.response.status
      });
    } else if (error.request) {
      res.status(503).json({
        success: false,
        error: 'Third-party API did not respond',
        message: error.message
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }
});

// Weather API endpoint with field filtering
app.post('/api/weather', async (req, res) => {
  try {
    const { city, fields = null } = req.body;
    
    if (!city) {
      return res.status(400).json({
        success: false,
        error: 'City name is required'
      });
    }

    const API_KEY = process.env.WEATHER_API_KEY;
    
    if (!API_KEY || API_KEY === 'your_api_key_here') {
      return res.status(500).json({
        success: false,
        error: 'Weather API key not configured. Please add WEATHER_API_KEY to .env file'
      });
    }

    console.log(`[WEATHER] Fetching data for city: ${city}`);

    const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${API_KEY}&units=metric`;
    
    const response = await axios.get(url);
    
    // Filter response data if fields are specified
    const filteredData = fields 
      ? filterFields(response.data, fields)
      : response.data;

    console.log(`[WEATHER] Successfully fetched data for ${city}. Fields: ${fields ? fields.join(', ') : 'all'}`);

    res.json({
      success: true,
      data: filteredData,
      fields_requested: fields || 'all',
      city: city
    });
    
  } catch (error) {
    console.error('[WEATHER ERROR]:', error.message);
    
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.message || error.message
    });
  }
});

// Get available fields from a weather API response (for UI selection)
app.get('/api/weather/fields', (req, res) => {
  res.json({
    success: true,
    available_fields: {
      basic: [
        'name',
        'sys.country',
        'weather[0].description',
        'weather[0].main'
      ],
      temperature: [
        'main.temp',
        'main.feels_like',
        'main.temp_min',
        'main.temp_max'
      ],
      atmospheric: [
        'main.pressure',
        'main.humidity',
        'main.sea_level',
        'main.grnd_level'
      ],
      wind: [
        'wind.speed',
        'wind.deg',
        'wind.gust'
      ],
      other: [
        'visibility',
        'clouds.all',
        'dt',
        'timezone',
        'coord.lat',
        'coord.lon'
      ]
    },
    example_usage: {
      url: '/api/weather',
      method: 'POST',
      body: {
        city: 'London',
        fields: ['name', 'main.temp', 'main.humidity', 'weather[0].description']
      }
    }
  });
});

// Get list of available APIs (for future expansion)
app.get('/api/available-apis', (req, res) => {
  res.json({
    success: true,
    apis: [
      {
        name: 'Weather',
        endpoint: '/api/weather',
        method: 'POST',
        requires_key: true,
        description: 'Get weather data for any city with optional field filtering',
        fields_endpoint: '/api/weather/fields'
      },
      {
        name: 'Universal Proxy',
        endpoint: '/api/proxy',
        method: 'POST',
        requires_key: false,
        description: 'Proxy any API request with field filtering support'
      }
      // Future APIs can be added here:
      // - Currency conversion
      // - Geolocation
      // - News API
      // - Stock market
      // - Flight data
    ]
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    available_endpoints: [
      'GET /health',
      'POST /api/proxy',
      'POST /api/weather',
      'GET /api/weather/fields',
      'GET /api/available-apis'
    ]
  });
});

// Start server
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 BACKEND SERVER STARTED SUCCESSFULLY');
  console.log('='.repeat(60));
  console.log(`📍 Server URL: http://localhost:${PORT}`);
  console.log(`⏰ Started at: ${new Date().toLocaleString()}`);
  console.log('\n📋 Available Endpoints:');
  console.log(`   ✓ GET  /health              - Health check`);
  console.log(`   ✓ POST /api/proxy           - Universal API proxy`);
  console.log(`   ✓ POST /api/weather         - Weather data with filtering`);
  console.log(`   ✓ GET  /api/weather/fields  - Available weather fields`);
  console.log(`   ✓ GET  /api/available-apis  - List all APIs`);
  console.log('\n🌐 CORS: Enabled for all origins');
  console.log('🔑 API Key: ' + (process.env.WEATHER_API_KEY ? '✓ Configured' : '✗ Not configured'));
  console.log('='.repeat(60) + '\n');
});

module.exports = app;