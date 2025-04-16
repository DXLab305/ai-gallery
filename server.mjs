import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import Replicate from 'replicate';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

console.log("? Token loaded:", process.env.REPLICATE_API_TOKEN);

const app = express();
const PORT = process.env.PORT || 3001;
const galleryPath = path.join(__dirname, 'public', 'gallery');

if (!fs.existsSync(galleryPath)) {
  fs.mkdirSync(galleryPath, { recursive: true });
}

app.use(cors());
app.use(bodyParser.json());
app.use('/gallery', express.static(galleryPath));

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN
});

app.get('/', (req, res) => {
  res.send('AI Gallery backend is running (with SDK).');
});

app.post('/generate', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

  const filteredPrompt = `fine art painting style, ${prompt}`;
  console.log('Generating via SDK:', filteredPrompt);

  try {
    const output = await replicate.run(
      "stability-ai/sdxl",
      {
        input: {
          prompt: filteredPrompt,
          width: 1024,
          height: 576
        }
      }
    );

    const imageUrl = output[0];
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
    console.error("SDK generation error:", err);
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
  console.log(`? AI Gallery Server (SDK) running on port ${PORT}`);
});
