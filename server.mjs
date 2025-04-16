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

app.use(cors());
app.use(bodyParser.json());
app.use('/gallery', express.static(galleryPath));

app.get('/', (req, res) => {
  res.send('AI Gallery backend is running.');
});

app.post('/generate', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

  const filteredPrompt = `fine art painting style, ${prompt}`;
  console.log('Generating:', filteredPrompt);

  try {
    const response = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Token ${process.env.REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        version: "db21e45a6f06cdbda5410f9d2a3b6c891d53e5d51d53d9f9a0c82ecf5c3cbf5a",
        input: {
          prompt: filteredPrompt,
          width: 1920,
          height: 1080
        }
      })
    });

    const replicateResult = await response.json();

    if (replicateResult?.error) {
      return res.status(500).json({ error: replicateResult.error });
    }

    const predictionId = replicateResult.id;

    const getImageUrl = async () => {
      let imageUrl = null;
      while (!imageUrl) {
        const poll = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
          headers: {
            Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`
          }
        });
        const status = await poll.json();
        if (status.status === "succeeded") {
          imageUrl = status.output[0];
        } else if (status.status === "failed") {
          throw new Error("Image generation failed");
        } else {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      return imageUrl;
    };

    const imageUrl = await getImageUrl();
    const filename = `img-${Date.now()}.jpg`;
    const localPath = path.join(galleryPath, filename);

    const imageRes = await fetch(imageUrl);
    const buffer = await imageRes.buffer();

    await sharp(buffer)
      .resize({ width: 1920, height: 1080, fit: "cover" })
      .toFile(localPath);

    limitGalleryImages();

    res.json({ imageUrl: `/gallery/${filename}` });
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
