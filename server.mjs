import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

console.log('Loaded API key:', process.env.OPENAI_API_KEY);

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 3001;

// Root route
app.get('/', (req, res) => {
  res.send('Server is running!');
});

// Generate image with OpenAI
app.post('/generate', async (req, res) => {
  const { prompt } = req.body;
  console.log('Received prompt:', prompt);

  try {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt,
        n: 1,
        size: '1024x1024'
      })
    });

    const data = await response.json();

    console.log('OpenAI raw response:', data);

    if (data?.data?.length && data.data[0]?.url) {
      const imageUrl = data.data[0].url;
      res.json({ imageUrl });
    } else if (data?.error) {
      console.error('OpenAI API error:', data.error);
      res.status(500).json({ error: data.error.message });
    } else {
      console.error('Unexpected OpenAI response:', data);
      res.status(500).json({ error: 'OpenAI did not return an image URL.' });
    }
  } catch (err) {
    console.error('Error generating image:', err);
    res.status(500).json({ error: 'Failed to generate image' });
  }
});

// === GALLERY FEATURE ===
const GALLERY_FILE = path.join(__dirname, 'gallery.json');

// Submit artwork to gallery
app.post('/submit', async (req, res) => {
  const { prompt, imageUrl } = req.body;

  if (!prompt || !imageUrl) {
    return res.status(400).json({ error: 'Prompt and image URL are required.' });
  }

  try {
    let existing = [];
    if (fs.existsSync(GALLERY_FILE)) {
      const raw = fs.readFileSync(GALLERY_FILE);
      existing = JSON.parse(raw);
    }

    const newEntry = { prompt, imageUrl, timestamp: Date.now() };
    existing.unshift(newEntry);
    const latest10 = existing.slice(0, 10);

    fs.writeFileSync(GALLERY_FILE, JSON.stringify(latest10, null, 2));
    res.json({ success: true });
  } catch (err) {
    console.error('Error writing to gallery.json:', err);
    res.status(500).json({ error: 'Failed to save artwork.' });
  }
});

// Get gallery JSON
app.get('/gallery', (req, res) => {
  try {
    const gallery = fs.existsSync(GALLERY_FILE)
      ? JSON.parse(fs.readFileSync(GALLERY_FILE))
      : [];
    res.json(gallery);
  } catch (err) {
    console.error('Error reading gallery.json:', err);
    res.status(500).json({ error: 'Failed to load gallery.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
