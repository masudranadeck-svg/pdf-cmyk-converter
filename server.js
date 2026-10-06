const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
app.use(cors());

const upload = multer({
  dest: '/tmp/uploads/',
  limits: { fileSize: 30 * 1024 * 1024 }
});

app.get('/', (req, res) => res.json({ status: 'CMYK Converter Running' }));

app.post('/api/convert-cmyk', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });

  const inputPath = req.file.path;
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmyk-'));
  const outputPath = path.join(outputDir, 'output.pdf');

  const gsArgs = [
    '-dSAFER', '-dBATCH', '-dNOPAUSE',
    '-sDEVICE=pdfwrite',
    '-sColorConversionStrategy=CMYK',
    '-dProcessColorModel=/DeviceCMYK',
    '-dOverrideICC=true',
    `-sOutputFile=${outputPath}`,
    inputPath
  ];

  execFile('gs', gsArgs, { timeout: 120000 }, (err) => {
    fs.unlink(inputPath, () => {});
    if (err) {
      fs.rmSync(outputDir, { recursive: true, force: true });
      return res.status(500).json({ error: 'Conversion failed' });
    }
    res.download(outputPath, 'converted-cmyk.pdf', () => {
      fs.rmSync(outputDir, { recursive: true, force: true });
    });
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Running on ${PORT}`));
