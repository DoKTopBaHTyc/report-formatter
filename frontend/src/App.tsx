import { useState } from "react";
import axios from "axios";

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await axios.post('/api/format', { file: base64 }, { responseType: 'blob' });

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'formatted.docx';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Ошибка при обработке файла');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Report Formatter</h1>
      <input type="file" accept=".doc,.docx" onChange={e => setFile(e.target.files?.[0] ?? null)} />
      <button onClick={handleUpload} disabled={!file || loading}>{loading ? 'Обработка...' : 'Загрузить и форматировать'}</button>
    </div>
  );
}

export default App;
