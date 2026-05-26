// src/services/pdfService.js
// PDF text extraction — supports native text PDFs
// In production: add Azure Document Intelligence for scanned PDFs (OCR)

const pdfParse = require("pdf-parse");
const mammoth  = require("mammoth");
const path     = require("path");
const fs       = require("fs");
const logger   = require("../config/logger");

async function extractTextFromFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const buf = fs.readFileSync(filePath);

  try {
    if (ext === ".pdf") {
      const data = await pdfParse(buf);
      const text = data.text.trim();

      if (!text || text.length < 50) {
        logger.warn("PDF appears to be scanned or empty — OCR needed", { filePath });
        // TODO: Replace this block with Azure Document Intelligence call:
        // const { DocumentAnalysisClient, AzureKeyCredential } = require("@azure/ai-form-recognizer");
        // const client = new DocumentAnalysisClient(endpoint, new AzureKeyCredential(key));
        // const poller = await client.beginAnalyzeDocument("prebuilt-read", buf);
        // const result = await poller.pollUntilDone();
        // return result.content;
        return text || "[PDF appears to be a scanned image. Please provide a text-based PDF or paste the content manually.]";
      }

      return text;
    }

    if (ext === ".docx" || ext === ".doc") {
      const result = await mammoth.extractRawText({ buffer: buf });
      return result.value.trim();
    }

    if (ext === ".txt") {
      return buf.toString("utf-8").trim();
    }

    throw new Error(`Unsupported file type: ${ext}`);
  } catch (err) {
    logger.error("Text extraction failed", { filePath, error: err.message });
    throw err;
  }
}

// Validate PDF: not password-protected, not empty, not corrupt
async function validatePDF(filePath) {
  try {
    const buf  = fs.readFileSync(filePath);
    const stat = fs.statSync(filePath);

    if (stat.size === 0) return { valid: false, reason: "File is empty" };
    if (stat.size > 10 * 1024 * 1024) return { valid: false, reason: "File exceeds 10MB limit" };

    const data = await pdfParse(buf);
    if (!data) return { valid: false, reason: "Could not read PDF" };

    return { valid: true, pageCount: data.numpages };
  } catch (err) {
    if (err.message.includes("password")) return { valid: false, reason: "PDF is password-protected" };
    return { valid: false, reason: "PDF appears corrupt: " + err.message };
  }
}

// Try to extract candidate email from resume text
function extractEmailFromText(text) {
  const match = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
  return match ? match[0] : null;
}

module.exports = { extractTextFromFile, validatePDF, extractEmailFromText };