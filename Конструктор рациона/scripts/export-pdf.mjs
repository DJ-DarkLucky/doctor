import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const root = path.resolve(import.meta.dirname, '..')
const htmlPath = path.join(root, 'konstruktor-raciona-family.html')
const outputPath = path.join(root, 'konstruktor-raciona-family.pdf')
const tempDir = path.join(root, '.pdf-export')
const slidesDir = path.join(tempDir, 'slides')
const pdfHtmlPath = path.join(tempDir, 'pdf.html')
const twemojiScriptPath = path.join(root, 'node_modules/twemoji/dist/twemoji.min.js')
const twemojiSvgBase = `${pathToFileURL(path.join(root, 'node_modules/@twemoji')).href}/`

await rm(tempDir, { recursive: true, force: true })
await mkdir(slidesDir, { recursive: true })

const browser = await chromium.launch({ headless: true })

try {
  const page = await browser.newPage({
    viewport: { width: 1400, height: 1000 },
    deviceScaleFactor: 2,
  })

  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' })
  await page.addStyleTag({
    content: `
      html { scroll-behavior: auto !important; }
      body { background: #fff !important; }
      .topbar { display: none !important; }
      .deck { margin: 0 auto !important; gap: 34px !important; }
      img.emoji {
        width: 1em !important;
        height: 1em !important;
        margin: 0 .05em 0 .1em !important;
        vertical-align: -.12em !important;
        display: inline-block !important;
      }
      .quick-meal-icon img.emoji {
        width: 30px !important;
        height: 30px !important;
        margin: 0 !important;
        vertical-align: middle !important;
      }
    `,
  })
  await page.addScriptTag({ path: twemojiScriptPath })
  await page.evaluate((base) => {
    window.twemoji.parse(document.body, {
      base,
      folder: 'svg',
      ext: '.svg',
      attributes: () => ({
        draggable: 'false',
        loading: 'eager',
      }),
    })
  }, twemojiSvgBase)
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all(
      [...document.images].map((image) => {
        if (image.complete) return Promise.resolve()
        return new Promise((resolve) => {
          image.addEventListener('load', resolve, { once: true })
          image.addEventListener('error', resolve, { once: true })
        })
      }),
    )
  })

  const slideCount = await page.locator('.slide').count()
  const slideImages = []

  for (let index = 0; index < slideCount; index += 1) {
    const slide = page.locator('.slide').nth(index)
    await slide.scrollIntoViewIfNeeded()
    const imagePath = path.join(
      slidesDir,
      `slide-${String(index + 1).padStart(2, '0')}.png`,
    )
    await slide.screenshot({ path: imagePath, animations: 'disabled' })
    slideImages.push(pathToFileURL(imagePath).href)
  }

  const pdfHtml = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
@page { size: A4 landscape; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; }
.page {
  width: 297mm;
  height: 210mm;
  page-break-after: always;
  break-after: page;
  overflow: hidden;
}
.page:last-child {
  page-break-after: auto;
  break-after: auto;
}
img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: fill;
}
</style>
</head>
<body>
${slideImages.map((src) => `<section class="page"><img src="${src}" alt=""></section>`).join('\n')}
</body>
</html>
`
  await mkdir(tempDir, { recursive: true })
  await writeFile(pdfHtmlPath, pdfHtml)

  const pdfPage = await browser.newPage()
  await pdfPage.goto(pathToFileURL(pdfHtmlPath).href, { waitUntil: 'load' })
  await pdfPage.pdf({
    path: outputPath,
    format: 'A4',
    landscape: true,
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  })

  console.log(outputPath)
} finally {
  await browser.close()
}
