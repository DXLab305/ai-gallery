import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

console.log('Loaded API key:', process.env.OPENAI_API_KEY);

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 3001;

app.get('/', (req, res) => {
  res.send('Server is running!');
});

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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
