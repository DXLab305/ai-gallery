import express from 'express';
import fetch from 'node-fetch';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3001;
const galleryPath = path.join(__dirname, 'public', 'gallery');

if (!fs.existsSync(galleryPath)) {
  fs.mkdirSync(galleryPath, { recursive: true });
}

app.use(cors());
app.use(bodyParser.json());
app.use('/gallery', express.static(galleryPath));

app.get('/', (req, res) => {
  res.send('🎨 OpenAI Gallery server is running!');
});

app.post('/generate', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

  console.log('Generating via OpenAI API:', prompt);

  try {
    const openaiRes = await fetch("https://api.openai.com/v1/images/generations", {
      method: 'POST',
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt,
        n: 1,
        size: "1024x1024"
      })
    });

    const data = await openaiRes.json();

    if (!data?.data?.[0]?.url) {
      console.error('OpenAI error response:', data);
      return res.status(500).json({ error: 'OpenAI did not return a valid image URL.' });
    }

    const imageUrl = data.data[0].url;
    const filename = `img-${Date.now()}.jpg`;
    const localPath = path.join(galleryPath, filename);

    const imgRes = await fetch(imageUrl);
    const buffer = await imgRes.buffer();

    // Resize to Samsung Frame (1920x1080) with black bars
    await sharp(buffer)
      .resize({ width: 1920, height: 1080, fit: 'contain', background: '#000' })
      .toFile(localPath);

    limitGalleryImages();

    res.json({ imageUrl: `/gallery/${filename}` });
  } catch (err) {
    console.error('OpenAI generation failed:', err);
    res.status(500).json({ error: 'Failed to generate image.' });
  }
});

app.get('/gallery', (req, res) => {
  try {
    const files = fs.readdirSync(galleryPath)
      .filter(f => f.endsWith('.jpg'))
      .sort((a, b) => fs.statSync(path.join(galleryPath, b)).mtime - fs.statSync(path.join(galleryPath, a)).mtime)
      .slice(0, 10);

    const gallery = files.map(filename => ({
      imageUrl: `/gallery/${filename}`,
      prompt: filename.replace("img-", "").replace(".jpg", "").replace(/-/g, " ")
    }));

    res.json(gallery);
  } catch (err) {
    console.error("Failed to read gallery folder:", err);
    res.status(500).json({ error: "Unable to load gallery." });
  }
});

function limitGalleryImages() {
  const files = fs.readdirSync(galleryPath)
    .filter(f => f.endsWith('.jpg'))
    .sort((a, b) => fs.statSync(path.join(galleryPath, b)).mtime - fs.statSync(path.join(galleryPath, a)).mtime);

  const extras = files.slice(10);
  extras.forEach(file => fs.unlinkSync(path.join(galleryPath, file)));
}

app.listen(PORT, () => {
  console.log(`✅ AI Gallery (OpenAI) server running on port ${PORT}`);
});
