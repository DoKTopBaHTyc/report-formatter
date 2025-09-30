import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import { Document, Packer, Paragraph, TextRun } from 'docx';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const { file } = req.body;
    if (!file) return res.status(400).send('No file provided');

    const standardPath = path.join(process.cwd(), 'api', 'standard.docx');
    if (!fs.existsSync(standardPath)) return res.status(500).send('Standard file not found');

    // 1) Извлекаем текст с форматированием из эталона
    const stdBuffer = fs.readFileSync(standardPath);
    const stdResult = await mammoth.extractRawText({ buffer: stdBuffer });
    const stdText = stdResult.value;

    // 2) Извлекаем текст пользователя
    const userBuffer = Buffer.from(file, 'base64');
    const userResult = await mammoth.extractRawText({ buffer: userBuffer });
    const userText = userResult.value;

    // 3) Подготавливаем инструкцию для нейросети (OpenRouter)
    const prompt = `
Эталонный документ:\n${stdText}\n
Исходный документ:\n${userText}\n
Приведи исходный текст к виду эталона, сохрани стили: заголовки, списки, жирный/курсив.
Исправь орфографию и пунктуацию.
Выдай результат в формате: каждая строка — новый параграф; заголовки обозначь H1:, H2:, H3:; списки — "- " перед элементом.
`;

    // 4) Вызов OpenRouter
    const openaiResp = await fetch('https://api.openrouter.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Ты редактор Word файлов. Приводи текст к эталону, сохраняй стили.' },
          { role: 'user', content: prompt },
        ],
