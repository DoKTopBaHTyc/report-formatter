import fs from "fs";
import path from "path";
import mammoth from "mammoth";
import { Document, Packer, Paragraph, TextRun } from "docx";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  try {
    const { file } = req.body;
    if (!file) return res.status(400).send("No file provided");

    const standardPath = path.join(process.cwd(), "api", "standard.docx");
    if (!fs.existsSync(standardPath))
      return res.status(500).send("Standard file not found");

    // 1) Текст эталона
    const stdBuffer = fs.readFileSync(standardPath);
    const stdResult = await mammoth.extractRawText({ buffer: stdBuffer });
    const stdText = stdResult.value;

    // 2) Текст пользователя
    const userBuffer = Buffer.from(file, "base64");
    const userResult = await mammoth.extractRawText({ buffer: userBuffer });
    const userText = userResult.value;

    // 3) Инструкция для нейросети
    const prompt = `
Эталонный документ:\n${stdText}\n
Исходный документ:\n${userText}\n
Приведи текст к виду эталона, сохрани стили: заголовки, списки, жирный/курсив.
Исправь орфографию и пунктуацию.
Выдай результат так, чтобы каждая строка стала параграфом; заголовки H1:, H2:, H3:; списки — "- " перед элементом.
`;

    // 4) Вызов OpenRouter (закомментировано для теста без сети)

    const openaiResp = await fetch(
      "https://api.openrouter.ai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "Ты редактор Word файлов. Приводи текст к эталону, сохраняй стили.",
            },
            { role: "user", content: prompt },
          ],
          max_tokens: 3000,
        }),
      }
    );

    if (!openaiResp.ok) {
      const errText = await openaiResp.text();
      console.error("OpenRouter error:", errText);
      return res.status(500).send("OpenRouter API error");
    }

    const data = await openaiResp.json();
    const fixedText = data?.choices?.[0]?.message?.content || "";

    // 5) Заглушка для локального теста
    //     const fixedText = `Это тестовый текст. Каждая строка станет параграфом.
    // H1: Заголовок 1
    // - Список элемент 1
    // - Список элемент 2`;

    // 6) Собираем docx
    const paragraphs = fixedText
      .split(/\r?\n/)
      .map((line) => new Paragraph({ children: [new TextRun(line)] }));
    const doc = new Document({
      sections: [{ properties: {}, children: paragraphs }],
    });
    const buffer = await Packer.toBuffer(doc);

    // 7) Отправляем клиенту
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader("Content-Disposition", "attachment; filename=formatted.docx");
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error: " + (err.message || err));
  }
}
