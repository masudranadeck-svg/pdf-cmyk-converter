const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { execFile, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
app.use(cors());

const upload = multer({
  dest: '/tmp/uploads/',
  limits: { fileSize: 30 * 1024 * 1024 }
});

app.get('/', (req, res) => res.json({ 
  status: 'Converter API Running', 
  endpoints: ['/api/convert-cmyk', '/api/convert-eps', '/api/convert-svg', '/api/convert-ai', '/api/pdf-to-word'] 
}));

// ===== Helper: Ghostscript চালাও =====
const runGsAndDownload = (args, res, inputPath, outputDir, outPath, downloadName) => {
  execFile('gs', args, { timeout: 180000 }, (err) => {
    if (err) {
      fs.rmSync(outputDir, { recursive: true, force: true });
      fs.unlink(inputPath, () => {});
      return res.status(500).json({ error: 'Conversion failed', details: err.message });
    }
    res.download(outPath, downloadName, () => {
      fs.rmSync(outputDir, { recursive: true, force: true });
      fs.unlink(inputPath, () => {});
    });
  });
};

// ===== ১. RGB → CMYK =====
app.post('/api/convert-cmyk', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });

  const inputPath = req.file.path;
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmyk-'));
  const out = path.join(outputDir, 'output.pdf');

  runGsAndDownload([
    '-dSAFER', '-dBATCH', '-dNOPAUSE',
    '-sDEVICE=pdfwrite',
    '-sColorConversionStrategy=CMYK',
    '-dProcessColorModel=/DeviceCMYK',
    '-dOverrideICC=true',
    `-sOutputFile=${out}`,
    inputPath
  ], res, inputPath, outputDir, out, 'converted-cmyk.pdf');
});

// ===== ২. PDF → EPS =====
app.post('/api/convert-eps', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });

  const inputPath = req.file.path;
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eps-'));
  const out = path.join(outputDir, 'output.eps');

  runGsAndDownload([
    '-dSAFER', '-dBATCH', '-dNOPAUSE',
    '-sDEVICE=eps2write',
    `-sOutputFile=${out}`,
    inputPath
  ], res, inputPath, outputDir, out, 'converted-vector.eps');
});

// ===== ৩. PDF → SVG (Inkscape) =====
app.post('/api/convert-svg', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });

  const inputPath = req.file.path;
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'svg-'));
  const out = path.join(outputDir, 'output.svg');

  execFile('inkscape', [inputPath, '--export-type=svg', `--export-filename=${out}`],
    { timeout: 180000 }, (err) => {
      fs.unlink(inputPath, () => {});
      if (err) {
        fs.rmSync(outputDir, { recursive: true, force: true });
        return res.status(500).json({ error: 'SVG conversion failed', details: err.message });
      }
      res.download(out, 'converted-vector.svg', () => {
        fs.rmSync(outputDir, { recursive: true, force: true });
      });
    });
});

// ===== ৪. PDF → AI =====
app.post('/api/convert-ai', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });

  const inputPath = req.file.path;
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-'));
  const out = path.join(outputDir, 'output.ai');

  runGsAndDownload([
    '-dSAFER', '-dBATCH', '-dNOPAUSE',
    '-sDEVICE=pdfwrite',
    '-dCompatibilityLevel=1.4',
    '-dPDFSETTINGS=/prepress',
    '-dEmbedAllFonts=true',
    '-dSubsetFonts=true',
    '-dAutoRotatePages=/None',
    '-dColorConversionStrategy=/LeaveColorUnchanged',
    `-sOutputFile=${out}`,
    inputPath
  ], res, inputPath, outputDir, out, 'converted-vector.ai');
});

// ===== ৫. PDF → Word (.docx) — বাংলা + ইংরেজি =====
app.post('/api/pdf-to-word', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });

  const inputPath = req.file.path;
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'word-'));
  const out = path.join(outputDir, 'output.docx');

  // LibreOffice headless দিয়ে PDF → DOCX
  execFile('libreoffice', [
    '--headless', '--invisible', '--norestore',
    '--convert-to', 'docx',
    '--outdir', outputDir,
    inputPath
  ], { timeout: 180000 }, (err, stdout, stderr) => {
    fs.unlink(inputPath, () => {});
    if (err) {
      fs.rmSync(outputDir, { recursive: true, force: true });
      return res.status(500).json({ error: 'Conversion failed', details: err.message });
    }
    // LibreOffice ইনপুট ফাইলের নামে আউটপুট বানায়, তাই নাম বদলাই
    const convertedName = path.join(outputDir, path.parse(inputPath).name + '.docx');
    const finalPath = fs.existsSync(convertedName) ? convertedName : out;
    
    if (!fs.existsSync(finalPath)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
      return res.status(500).json({ error: 'Output not found' });
    }
    res.download(finalPath, 'converted-document.docx', () => {
      fs.rmSync(outputDir, { recursive: true, force: true });
    });
  });
});

// ===== ৬. Word (.docx) → PDF — বাংলা + ইংরেজি =====
app.post('/api/word-to-pdf', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });

  const inputPath = req.file.path;
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpdf-'));

  // LibreOffice দিয়ে DOCX → PDF
  execFile('libreoffice', [
    '--headless', '--invisible', '--norestore',
    '--convert-to', 'pdf',
    '--outdir', outputDir,
    inputPath
  ], { timeout: 180000 }, (err) => {
    fs.unlink(inputPath, () => {});
    if (err) {
      fs.rmSync(outputDir, { recursive: true, force: true });
      return res.status(500).json({ error: 'Conversion failed', details: err.message });
    }
    const convertedName = path.join(outputDir, path.parse(inputPath).name + '.pdf');
    
    if (!fs.existsSync(convertedName)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
      return res.status(500).json({ error: 'Output not found' });
    }
    res.download(convertedName, 'converted-document.pdf', () => {
      fs.rmSync(outputDir, { recursive: true, force: true });
    });
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Running on ${PORT}`));
