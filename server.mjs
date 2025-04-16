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
  res.send('🎨 AI Gallery backend is running with OpenAI + layout enforcement.');
});

app.post('/generate', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

  const filteredPrompt = `a fine art painting of ${prompt}, placed in the top 70% of the canvas, bottom 30% plain black, no border, no frame, cinematic lighting`;

  console.log('Generating:', filteredPrompt);

  try {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: filteredPrompt,
        n: 1,
        size: '1024x1024'
      })
    });

    const data = await response.json();

    if (data?.data?.length && data.data[0]?.url) {
      const imageUrl = data.data[0].url;
      const filename = `img-${Date.now()}.jpg`;
      const localPath = path.join(galleryPath, filename);

      const imageRes = await fetch(imageUrl);
      const buffer = await imageRes.buffer();

      // 🖼 Crop top 70% and add black filler bottom (30%)
      await sharp(buffer)
        .extract({ width: 1024, height: 716, top: 0, left: 0 })
        .extend({
          bottom: 308,
          background: { r: 0, g: 0, b: 0 }
        })
        .toFile(localPath);

      limitGalleryImages();

      res.json({ imageUrl: `/gallery/${filename}` });
    } else {
      const errMsg = data?.error?.message || 'OpenAI did not return an image.';
      console.error('OpenAI API error:', errMsg);
      res.status(500).json({ error: errMsg });
    }

  } catch (err) {
    console.error("Generation error:", err);
    res.status(500).json({ error: "Failed to generate image." });
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
  console.log(`🎨 AI Gallery Server running on port ${PORT}`);
});
