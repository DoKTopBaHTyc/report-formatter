import fs from "fs";
import path from "path";
import mammoth from "mammoth";
import { Document, Packer, Paragraph, TextRun } from "docx";

export default async function handler(req, res) {
  console.log("Handler start"); // начало выполнения

  if (req.method !== "POST") {
    console.log("Method not allowed:", req.method);
    return res.status(405).send("Method Not Allowed");
  }

  try {
    const { file } = req.body;
    console.log("Received file:", !!file);

    if (!file) return res.status(400).send("No file provided");

    const standardPath = path.join(process.cwd(), "api", "standard.docx");
    console.log("Standard path:", standardPath);

    if (!fs.existsSync(standardPath)) {
      console.log("Standard file not found");
      return res.status(500).send("Standard file not found");
    }

    // 1) Текст эталона
    console.log("Reading standard file...");
    const stdBuffer = fs.readFileSync(standardPath);
    const stdResult = await mammoth.extractRawText({ buffer: stdBuffer });
    const stdText = stdResult.value;
    console.log("Standard text extracted, length:", stdText.length);

    // 2) Текст пользователя
    console.log("Reading user file...");
    const userBuffer = Buffer.from(file, "base64");
    const userResult = await mammoth.extractRawText({ buffer: userBuffer });
    const userText = userResult.value;
    console.log("User text extracted, length:", userText.length);

    // 3) Инструкция для нейросети
    const prompt = `
Эталонный документ:\n${stdText}\n
Исходный документ:\n${userText}\n
Приведи текст к виду эталона, сохрани стили: заголовки, списки, жирный/курсив.
Исправь орфографию и пунктуацию.
Выдай результат так, чтобы каждая строка стала параграфом; заголовки H1:, H2:, H3:; списки — "- " перед элементом.
`;
    console.log("Prompt prepared");

    // 4) Вызов OpenRouter
    console.log("Calling OpenRouter...");
    const openaiResp = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
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

    console.log("OpenRouter response received, status:", openaiResp.status);

    if (!openaiResp.ok) {
      const errText = await openaiResp.text();
      console.error("OpenRouter error:", errText);
      return res.status(500).send("OpenRouter API error");
    }

    const data = await openaiResp.json();
    const fixedText = data?.choices?.[0]?.message?.content || "";
    console.log("Fixed text length:", fixedText.length);

    // 5) Собираем docx
    console.log("Generating DOCX...");
    const paragraphs = fixedText
      .split(/\r?\n/)
      .map((line) => new Paragraph({ children: [new TextRun(line)] }));
    const doc = new Document({
      sections: [{ properties: {}, children: paragraphs }],
    });
    const buffer = await Packer.toBuffer(doc);
    console.log("DOCX generated, size:", buffer.length);

    // 6) Отправляем клиенту
    console.log("Sending response...");
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader("Content-Disposition", "attachment; filename=formatted.docx");
    res.send(buffer);

    console.log("Handler finished successfully");
  } catch (err) {
    console.error("Caught error:", err);
    res.status(500).send("Server error: " + (err.message || err));
  }
}
