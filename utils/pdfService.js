const puppeteer = require('puppeteer');
const fs = require('fs');

let browserInstance = null;

/**
 * Detect local browser executable path for Windows/Linux fallbacks.
 */
function getBrowserExecutablePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  const possiblePaths = [
    // Standard Linux paths (Debian/Ubuntu/CentOS/AlmaLinux/Docker)
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/usr/local/bin/chrome',
    '/usr/local/bin/chromium',
    // Windows standard paths
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    (process.env.LOCALAPPDATA ? process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe' : null),
    (process.env.LOCALAPPDATA ? process.env.LOCALAPPDATA + '\\Microsoft\\Edge\\Application\\msedge.exe' : null)
  ];

  for (const p of possiblePaths) {
    if (p && fs.existsSync(p)) {
      return p;
    }
  }
  return undefined; // Puppeteer will use bundled browser if available
}

/**
 * Retrieves a running Puppeteer browser instance or initializes a new one.
 */
async function getBrowser() {
  if (browserInstance && browserInstance.connected) {
    return browserInstance;
  }

  const execPath = getBrowserExecutablePath();
  const launchOptions = {
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
      '--no-first-run',
      '--no-zygote',
      '--font-render-hinting=none'
    ]
  };

  if (execPath) {
    launchOptions.executablePath = execPath;
  }

  try {
    browserInstance = await puppeteer.launch(launchOptions);
    browserInstance.on('disconnected', () => {
      browserInstance = null;
    });
    return browserInstance;
  } catch (err) {
    console.error('[PDFService] Failed to launch browser with custom executable, retrying with defaults:', err.message);
    delete launchOptions.executablePath;
    try {
      browserInstance = await puppeteer.launch(launchOptions);
      browserInstance.on('disconnected', () => {
        browserInstance = null;
      });
      return browserInstance;
    } catch (fallbackErr) {
      browserInstance = null;
      throw fallbackErr;
    }
  }
}

/**
 * Generate a PDF buffer from rendered HTML string using Puppeteer page.pdf().
 * 
 * @param {string} htmlContent - The self-contained HTML report.
 * @param {object} options - Configuration options (format, landscape, margins).
 * @returns {Promise<Buffer>} - Buffer of the generated PDF.
 */
async function generatePdfFromHtml(htmlContent, options = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // Set viewport to standard A4 width
    await page.setViewport({
      width: 794,
      height: 1123,
      deviceScaleFactor: 2
    });

    // Set content and wait until DOM is ready (fast execution, no external resources needed)
    await page.setContent(htmlContent, {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });

    const isLandscape = options.landscape === true;

    const pdfBuffer = await page.pdf({
      format: options.format || 'A4',
      landscape: isLandscape,
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: options.marginTop || '12mm',
        right: options.marginRight || '18mm',
        bottom: options.marginBottom || '12mm',
        left: options.marginLeft || '18mm'
      }
    });

    return Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
  } catch (error) {
    console.error('[PDFService] Error during page.pdf() execution:', error);
    throw new Error('Puppeteer PDF generation failed: ' + error.message);
  } finally {
    try {
      await page.close();
    } catch (_) {}
  }
}

module.exports = {
  generatePdfFromHtml,
  getBrowser
};
