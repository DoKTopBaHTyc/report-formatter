import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import { Document, Packer, Paragraph } from 'docx';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  try {
    const { file } = req.body;
    if (!file) return res.status(400).send('No file provided');

    const standardPath = path.join(process.cwd(), 'api', 'standard.docx');
    if (!fs.existsSync(standardPath)) return res.status(500).send('Standard file not found');

    const stdBuffer = fs.readFileSync(standardPath);
    const stdText = (await mammoth.extractRawText({ buffer: stdBuffer })).value;

    const userBuffer = Buffer.from(file, 'base64');
    const userText = (await mammoth.extractRawText({ buffer: userBuffer })).value;

    const prompt = `Эталон:\n${stdText}\n\nИсходный текст:\n${userText}\n\nПриведи текст к виду эталона, исправь орфографию, пунктуацию и формат.`;

    const openaiResp = await fetch('https://api.openrouter.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Ты редактор Word файлов.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 3000
      })
    });

    const fixedText = (await openaiResp.json())?.choices?.[0]?.message?.content || '';

    const paragraphs = fixedText.split(/\r?\n/).map(line => new Paragraph(line));
    const doc = new Document({ sections: [{ properties: {}, children: paragraphs }] });
    const outBuffer = await Packer.toBuffer(doc);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename=formatted.docx');
    res.send(outBuffer);

  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
}
