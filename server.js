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
  limits: { fileSize: 100 * 1024 * 1024 }
});
app.get('/', (req, res) => res.json({
  status: 'Converter API Running',
  endpoints: ['/api/convert-cmyk', '/api/convert-eps', '/api/convert-svg', '/api/convert-ai', '/api/pdf-to-word', '/api/word-to-pdf', '/api/compress-pdf']
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
  // ★★ FIX: --infilter=writer_pdf_import → PDF কে Writer এ খুলবে ★★
  execFile('libreoffice', [
    '--headless', '--invisible', '--norestore',
    '--infilter=writer_pdf_import',
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
// ===== ৭. PDF Size Reducer — সাইজ কমানো (Preset + Custom Target Size) =====
const compressUpload = upload.single('file');
app.post('/api/compress-pdf', (req, res) => {
  compressUpload(req, res, (err) => {
    if (err) {
      // ফাইল খুব বড় হলে সুন্দর এরর মেসেজ
      const friendly = err.code === 'LIMIT_FILE_SIZE' ? 'File size 100 MB er kom hote hobe!' : (err.message || 'Upload failed');
      return res.status(400).json({ error: 'Upload failed', details: friendly });
    }
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const inputPath = req.file.path;
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'compress-'));
    const out = path.join(outputDir, 'compressed.pdf');
    const best = path.join(outputDir, 'best.pdf');
    const levels = ['screen', 'ebook', 'printer', 'prepress'];
    const level = levels.includes(req.body.level) ? req.body.level : 'ebook';
    // Custom target size (KB) — frontend theke targetKB ashle iterative komano hobe
    const targetKB = parseInt(req.body.targetKB, 10);
    const hasTarget = !isNaN(targetKB) && targetKB >= 5;

    const runGs = (args) => new Promise((resolve) => {
      execFile('gs', args, { timeout: 60000 }, (e) => resolve(!e));
    });

    (async () => {
      try {
        if (hasTarget) {
          // ==== CUSTOM TARGET MODE: step by step quality kome target e namao ====
          // ধাপ ১: আগে মাঝারি প্রিসেট দিয়ে দেখো
          let ok = await runGs([
            '-dSAFER', '-dBATCH', '-dNOPAUSE', '-dQUIET',
            '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.5',
            '-dPDFSETTINGS=/ebook', '-dDetectDuplicateImages=true',
            `-sOutputFile=${out}`, inputPath
          ]);
          if (ok && fs.existsSync(out) && fs.statSync(out).size > 0) fs.copyFileSync(out, best);
          // ধাপ ২: image resolution + JPEG quality ladder — target e na porjonto
          const ladder = [
            { dpi: 150, q: 0.5 }, { dpi: 120, q: 1.0 }, { dpi: 100, q: 1.5 },
            { dpi: 80, q: 2.0 }, { dpi: 60, q: 3.0 }, { dpi: 45, q: 4.0 },
            { dpi: 30, q: 5.0 }, { dpi: 20, q: 6.0 }
          ];
          for (const step of ladder) {
            if (fs.existsSync(best) && fs.statSync(best).size <= targetKB * 1024) break;
            ok = await runGs([
              '-dSAFER', '-dBATCH', '-dNOPAUSE', '-dQUIET',
              '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.5',
              '-dDetectDuplicateImages=true',
              '-dPassThroughJPEGImages=false', '-dPassThroughJPXImages=false',
              '-dDownsampleColorImages=true', '-dDownsampleGrayImages=true',
              '-dAutoFilterColorImages=false', '-dColorImageFilter=/DCTEncode',
              '-dAutoFilterGrayImages=false', '-dGrayImageFilter=/DCTEncode',
              '-dColorImageDownsampleType=/Average', '-dGrayImageDownsampleType=/Average',
              '-dColorImageDownsampleThreshold=1.0', '-dGrayImageDownsampleThreshold=1.0',
              `-dColorImageResolution=${step.dpi}`, `-dGrayImageResolution=${step.dpi}`,
              `-dMonoImageResolution=${Math.max(150, step.dpi * 3)}`,
              `-sOutputFile=${out}`,
              '-c', `<< /ColorImageDict << /QFactor ${step.q} /HSamples [1 1 1 1] /VSamples [1 1 1 1] >> /GrayImageDict << /QFactor ${step.q} /HSamples [1 1 1 1] /VSamples [1 1 1 1] >> >> setdistillerparams`,
              '-f', inputPath
            ]);
            // sobcheye choto file ta rekhe dao
            if (ok && fs.existsSync(out) && fs.statSync(out).size > 0) {
              if (!fs.existsSync(best) || fs.statSync(out).size < fs.statSync(best).size) {
                fs.copyFileSync(out, best);
              }
            }
          }
          if (!fs.existsSync(best)) throw new Error('Compression failed');
          res.download(best, 'compressed.pdf', () => {
            fs.rmSync(outputDir, { recursive: true, force: true });
            fs.unlink(inputPath, () => {});
          });
        } else {
          // ==== PRESET MODE (screen/ebook/printer) — ager moto ====
          const ok = await runGs([
            '-dSAFER', '-dBATCH', '-dNOPAUSE', '-dQUIET',
            '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.5',
            `-dPDFSETTINGS=/${level}`, '-dDetectDuplicateImages=true',
            `-sOutputFile=${out}`, inputPath
          ]);
          if (!ok || !fs.existsSync(out) || fs.statSync(out).size === 0) throw new Error('Compression failed');
          res.download(out, 'compressed.pdf', () => {
            fs.rmSync(outputDir, { recursive: true, force: true });
            fs.unlink(inputPath, () => {});
          });
        }
      } catch (e) {
        fs.rmSync(outputDir, { recursive: true, force: true });
        fs.unlink(inputPath, () => {});
        return res.status(500).json({ error: 'Compression failed', details: e.message });
      }
    })();
  });
});
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Running on ${PORT}`));
