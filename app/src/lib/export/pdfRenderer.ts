// =============================================================
// PDF Rendering Engine for Silent Memoirs Export
// Converts markdown AST into pdf-lib draw calls.
// Pure functions — no DOM, no React, no worker messaging.
// =============================================================

import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts, PDFImage, PageSizes } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type { Root, RootContent, PhrasingContent, TableRow, TableCell, ListItem } from 'mdast';

// --- Constants ---

const PAGE_WIDTH = PageSizes.A4[0];   // 595.28
const PAGE_HEIGHT = PageSizes.A4[1];  // 841.89
const MARGIN = 28.35; // ~1cm in points
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const LINE_HEIGHT_FACTOR = 1.4;

// Font sizes
const FONT_SIZE_TITLE_PAGE_NAME = 24;
const FONT_SIZE_TITLE_PAGE_YEAR = 16;
const FONT_SIZE_ENTRY_TITLE = 18;
const FONT_SIZE_ENTRY_TIMESTAMP = 11;
const FONT_SIZE_BODY = 12;
const FONT_SIZE_H1 = 20;
const FONT_SIZE_H2 = 17;
const FONT_SIZE_H3 = 15;
const FONT_SIZE_H4 = 13;
const FONT_SIZE_CODE = 10;

// Colors
const COLOR_TEXT = rgb(0.1, 0.1, 0.1);
const COLOR_DIMMED = rgb(0.45, 0.45, 0.45);
const COLOR_BLOCKQUOTE_BORDER = rgb(0.804, 0.471, 0.302); // terracotta-6 approx #cd784d
const COLOR_BLOCKQUOTE_BG = rgb(0.96, 0.93, 0.9);
const COLOR_ENTRY_TITLE = rgb(0.796, 0.431, 0.251); // terracotta-6 #cb6e40
const COLOR_TABLE_HEADER_BG = rgb(0.92, 0.92, 0.92);
const COLOR_TABLE_BORDER = rgb(0.75, 0.75, 0.75);
const COLOR_RULE = rgb(0.8, 0.8, 0.8);

// --- Types ---

export interface PdfFonts {
  montserratRegular: PDFFont;
  montserratBold: PDFFont;
  garamondRegular: PDFFont;
  garamondBold: PDFFont;
  garamondItalic: PDFFont;
  courier: PDFFont;
}

export interface ExportEntryData {
  title: string;
  date: string;
  content: string;
}

export interface TitlePageData {
  userName: string;
  year?: string;
  profilePictureBytes?: Uint8Array | null;
  logoBytes?: Uint8Array | null;
  entryTitle?: string;
  entryDate?: string;
}

interface RenderContext {
  doc: PDFDocument;
  fonts: PdfFonts;
  page: PDFPage;
  y: number;
  images: Map<string, Uint8Array>;
  warnings: string[];
}

// --- Font loading ---

export async function embedFonts(
  doc: PDFDocument,
  fontBuffers: Record<string, ArrayBuffer>,
): Promise<PdfFonts> {
  doc.registerFontkit(fontkit);
  const montserratRegular = await doc.embedFont(new Uint8Array(fontBuffers['Montserrat-Regular.ttf']));
  const montserratBold = await doc.embedFont(new Uint8Array(fontBuffers['Montserrat-Bold.ttf']));
  const garamondRegular = await doc.embedFont(new Uint8Array(fontBuffers['EBGaramond-Regular.ttf']));
  const garamondBold = await doc.embedFont(new Uint8Array(fontBuffers['EBGaramond-Bold.ttf']));
  const garamondItalic = await doc.embedFont(new Uint8Array(fontBuffers['EBGaramond-Italic.ttf']));
  const courier = await doc.embedFont(StandardFonts.Courier);
  return { montserratRegular, montserratBold, garamondRegular, garamondBold, garamondItalic, courier };
}

// --- Page management ---

function addPage(ctx: RenderContext): void {
  ctx.page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  ctx.y = PAGE_HEIGHT - MARGIN;
}

function ensureSpace(ctx: RenderContext, needed: number): void {
  if (ctx.y - needed < MARGIN) {
    addPage(ctx);
  }
}

// --- Text sanitization ---
// pdf-lib uses fontkit which applies OpenType GSUB ligature substitutions,
// producing glyphs with broken ToUnicode mappings (e.g. "fl" → "ϱ").
// We insert ZWNJ (U+200C) between ligature-forming pairs to prevent this.
// We also decompose pre-existing Unicode ligature codepoints (U+FB00–06)
// and strip characters the font cannot encode.

const LIGATURE_MAP: Record<string, string> = {
  '\uFB00': 'ff',
  '\uFB01': 'fi',
  '\uFB02': 'fl',
  '\uFB03': 'ffi',
  '\uFB04': 'ffl',
  '\uFB05': 'st',
  '\uFB06': 'st',
};

const LIGATURE_RE = /[\uFB00-\uFB06]/g;

// Insert ZWNJ between common Latin ligature-forming pairs (ff, fi, fl, fj, fb).
const LIGATURE_BREAK_RE = /f(?=[fifjlb])/gi;
const ZWNJ = '\u200C';

// Common Unicode punctuation / symbol replacements
const UNICODE_REPLACEMENTS: [RegExp, string][] = [
  [/[\u2018\u2019\u201A\uFF07]/g, "'"],    // smart single quotes → '
  [/[\u201C\u201D\u201E\uFF02]/g, '"'],    // smart double quotes → "
  [/[\u2013\u2014]/g, '-'],                 // en/em dash → -
  [/\u2026/g, '...'],                        // ellipsis → ...
  [/\u00A0/g, ' '],                          // non-breaking space → space
  [/[\u2022\u2023\u25E6\u2043]/g, '*'],     // bullet variants → *
  [/\u00D7/g, 'x'],                         // multiplication sign → x
  [/[\u2190-\u21FF]/g, '->'],               // arrows → ->
];

function sanitizeText(text: string): string {
  // 1. Decompose any pre-existing Unicode ligature codepoints
  let result = text.replace(LIGATURE_RE, (ch) => LIGATURE_MAP[ch] ?? ch);

  // 2. Break ligature-forming sequences with ZWNJ
  result = result.replace(LIGATURE_BREAK_RE, `f${ZWNJ}`);

  // 3. Replace common Unicode punctuation with ASCII equivalents
  for (const [pattern, replacement] of UNICODE_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }

  // 4. Strip any remaining non-encodable characters.
  //    Keep printable ASCII, Latin-1 Supplement, and ZWNJ.
  result = result.replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF\u200C]/g, '?');

  return result;
}

// --- Text utilities ---

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(test, fontSize);
    if (width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  if (lines.length === 0) lines.push('');
  return lines;
}

function drawTextLines(
  ctx: RenderContext,
  lines: string[],
  font: PDFFont,
  fontSize: number,
  color = COLOR_TEXT,
  xOffset = 0,
): void {
  const lineHeight = fontSize * LINE_HEIGHT_FACTOR;
  for (const line of lines) {
    ensureSpace(ctx, lineHeight);
    ctx.page.drawText(sanitizeText(line), {
      x: MARGIN + xOffset,
      y: ctx.y - fontSize,
      size: fontSize,
      font,
      color,
    });
    ctx.y -= lineHeight;
  }
}

function drawWrappedText(
  ctx: RenderContext,
  text: string,
  font: PDFFont,
  fontSize: number,
  color = COLOR_TEXT,
  xOffset = 0,
  maxWidth = CONTENT_WIDTH,
): void {
  const lines = wrapText(text, font, fontSize, maxWidth - xOffset);
  drawTextLines(ctx, lines, font, fontSize, color, xOffset);
}

// --- Inline / phrasing content extraction ---

function extractText(nodes: PhrasingContent[]): string {
  let result = '';
  for (const node of nodes) {
    if (node.type === 'text') {
      result += node.value;
    } else if (node.type === 'inlineCode') {
      result += node.value;
    } else if ('children' in node) {
      result += extractText(node.children as PhrasingContent[]);
    }
  }
  return result;
}

// --- Phrasing content rendering (handles bold/italic/code inline) ---

function renderPhrasingContent(
  ctx: RenderContext,
  nodes: PhrasingContent[],
  baseFontSize: number,
  xOffset = 0,
  maxWidth = CONTENT_WIDTH,
): void {
  // Flatten all inline nodes into a single text string so the paragraph
  // wraps naturally. pdf-lib doesn't support mixed fonts on one line, so
  // we render everything with the body font.  Bold/italic markers are lost
  // in the PDF but the text flows correctly.
  const fullText = extractText(nodes);
  if (!fullText.trim()) return;
  drawWrappedText(ctx, fullText, ctx.fonts.garamondRegular, baseFontSize, COLOR_TEXT, xOffset, maxWidth);
}

// --- Block-level node rendering ---

async function renderImage(ctx: RenderContext, url: string): Promise<void> {
  const imageBytes = ctx.images.get(url);
  if (!imageBytes) {
    drawWrappedText(ctx, `[Image could not be exported: ${url}]`, ctx.fonts.courier, FONT_SIZE_CODE, COLOR_DIMMED);
    ctx.y -= 4;
    return;
  }

  let pdfImage: PDFImage;
  try {
    // Detect format from magic bytes to avoid try/catch corruption
    const isPng =
      imageBytes.length >= 8 &&
      imageBytes[0] === 0x89 &&
      imageBytes[1] === 0x50 &&
      imageBytes[2] === 0x4e &&
      imageBytes[3] === 0x47;
    const isJpeg =
      imageBytes.length >= 3 &&
      imageBytes[0] === 0xff &&
      imageBytes[1] === 0xd8 &&
      imageBytes[2] === 0xff;

    if (isPng) {
      pdfImage = await ctx.doc.embedPng(imageBytes);
    } else if (isJpeg) {
      pdfImage = await ctx.doc.embedJpg(imageBytes);
    } else {
      // Unknown format — try both as fallback
      try {
        pdfImage = await ctx.doc.embedPng(imageBytes);
      } catch {
        pdfImage = await ctx.doc.embedJpg(imageBytes);
      }
    }
  } catch (err) {
    ctx.warnings.push(`Failed to embed image: ${url}`);
    drawWrappedText(ctx, `[Image could not be exported: ${url}]`, ctx.fonts.courier, FONT_SIZE_CODE, COLOR_DIMMED);
    ctx.y -= 4;
    return;
  }

  const maxImgWidth = CONTENT_WIDTH * 0.5;
  const scale = Math.min(1, maxImgWidth / pdfImage.width);
  const drawWidth = pdfImage.width * scale;
  const drawHeight = pdfImage.height * scale;

  // Cap height to prevent a single image from exceeding page
  const maxImgHeight = PAGE_HEIGHT - 2 * MARGIN - 40;
  const heightScale = drawHeight > maxImgHeight ? maxImgHeight / drawHeight : 1;
  const finalWidth = drawWidth * heightScale;
  const finalHeight = drawHeight * heightScale;

  ensureSpace(ctx, finalHeight + 8);

  const xCenter = MARGIN + (CONTENT_WIDTH - finalWidth) / 2;
  ctx.page.drawImage(pdfImage, {
    x: xCenter,
    y: ctx.y - finalHeight,
    width: finalWidth,
    height: finalHeight,
  });
  ctx.y -= finalHeight + 8;
}

async function renderBlockquote(ctx: RenderContext, children: RootContent[]): Promise<void> {
  const indent = 0;
  const borderWidth = 4;
  const padding = 8;
  const savedY = ctx.y;

  // Render children with indent, collecting the Y range
  ctx.y -= padding;
  for (const child of children) {
    await renderNode(ctx, child, indent + borderWidth + padding);
  }
  ctx.y -= padding;

  const blockEndY = ctx.y;
  const blockHeight = savedY - blockEndY;

  // Draw the background and border retroactively on the current page
  // (Simplified: works best when blockquote fits on one page)
  ctx.page.drawRectangle({
    x: MARGIN + indent + borderWidth,
    y: blockEndY,
    width: CONTENT_WIDTH - indent - borderWidth,
    height: blockHeight,
    color: COLOR_BLOCKQUOTE_BG,
    opacity: 0.5,
  });
  ctx.page.drawRectangle({
    x: MARGIN + indent,
    y: blockEndY,
    width: borderWidth,
    height: blockHeight,
    color: COLOR_BLOCKQUOTE_BORDER,
  });

  // Re-render text on top of background
  ctx.y = savedY - padding;
  for (const child of children) {
    await renderNode(ctx, child, indent + borderWidth + padding);
  }
  ctx.y -= padding;
}

function renderTable(ctx: RenderContext, rows: TableRow[]): void {
  if (rows.length === 0) return;

  const colCount = Math.max(...rows.map(r => r.children.length));
  if (colCount === 0) return;

  const colWidth = CONTENT_WIDTH / colCount;
  const cellPadding = 4;
  const rowHeight = FONT_SIZE_BODY * LINE_HEIGHT_FACTOR + cellPadding * 2;

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    ensureSpace(ctx, rowHeight);

    const rowTop = ctx.y;
    const rowBottom = rowTop - rowHeight;

    // Header background
    if (rowIdx === 0) {
      ctx.page.drawRectangle({
        x: MARGIN,
        y: rowBottom,
        width: CONTENT_WIDTH,
        height: rowHeight,
        color: COLOR_TABLE_HEADER_BG,
      });
    }

    // Cell text
    for (let colIdx = 0; colIdx < colCount; colIdx++) {
      const cell: TableCell | undefined = row.children[colIdx];
      const cellText = cell ? extractText(cell.children as PhrasingContent[]) : '';
      const font = rowIdx === 0 ? ctx.fonts.garamondBold : ctx.fonts.garamondRegular;
      const truncated = truncateToWidth(cellText, font, FONT_SIZE_BODY, colWidth - cellPadding * 2);

      ctx.page.drawText(truncated, {
        x: MARGIN + colIdx * colWidth + cellPadding,
        y: rowBottom + cellPadding + 2,
        size: FONT_SIZE_BODY,
        font,
        color: COLOR_TEXT,
      });
    }

    // Cell borders
    for (let colIdx = 0; colIdx <= colCount; colIdx++) {
      const x = MARGIN + colIdx * colWidth;
      ctx.page.drawLine({
        start: { x, y: rowTop },
        end: { x, y: rowBottom },
        thickness: 0.5,
        color: COLOR_TABLE_BORDER,
      });
    }
    // Top border
    ctx.page.drawLine({
      start: { x: MARGIN, y: rowTop },
      end: { x: MARGIN + CONTENT_WIDTH, y: rowTop },
      thickness: 0.5,
      color: COLOR_TABLE_BORDER,
    });
    // Bottom border
    ctx.page.drawLine({
      start: { x: MARGIN, y: rowBottom },
      end: { x: MARGIN + CONTENT_WIDTH, y: rowBottom },
      thickness: 0.5,
      color: COLOR_TABLE_BORDER,
    });

    ctx.y = rowBottom;
  }
  ctx.y -= 4;
}

function truncateToWidth(text: string, font: PDFFont, fontSize: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, fontSize) <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 0 && font.widthOfTextAtSize(truncated + '…', fontSize) > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + '…';
}

async function renderListItems(ctx: RenderContext, items: ListItem[], ordered: boolean, xOffset: number): Promise<void> {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const bullet = ordered ? `${i + 1}. ` : '• ';
    const bulletWidth = ctx.fonts.garamondRegular.widthOfTextAtSize(bullet, FONT_SIZE_BODY);

    ensureSpace(ctx, FONT_SIZE_BODY * LINE_HEIGHT_FACTOR);
    ctx.page.drawText(bullet, {
      x: MARGIN + xOffset,
      y: ctx.y - FONT_SIZE_BODY,
      size: FONT_SIZE_BODY,
      font: ctx.fonts.garamondRegular,
      color: COLOR_TEXT,
    });

    // Render item children inline at bullet offset
    for (const child of item.children) {
      if (child.type === 'paragraph' && 'children' in child) {
        renderPhrasingContent(ctx, child.children, FONT_SIZE_BODY, xOffset + bulletWidth, CONTENT_WIDTH);
      } else if (child.type === 'list') {
        await renderListItems(ctx, child.children as ListItem[], child.ordered ?? false, xOffset + 16);
      } else {
        await renderNode(ctx, child, xOffset + bulletWidth);
      }
    }
  }
}

// --- Main node dispatcher ---

async function renderNode(ctx: RenderContext, node: RootContent, xOffset = 0): Promise<void> {
  switch (node.type) {
    case 'heading': {
      const depth = node.depth ?? 1;
      const sizes = [FONT_SIZE_H1, FONT_SIZE_H2, FONT_SIZE_H3, FONT_SIZE_H4, FONT_SIZE_BODY, FONT_SIZE_BODY];
      const fontSize = sizes[Math.min(depth - 1, sizes.length - 1)];
      const text = extractText(node.children);
      ctx.y -= 4; // spacing before heading
      drawWrappedText(ctx, text, ctx.fonts.montserratBold, fontSize, COLOR_TEXT, xOffset);
      ctx.y -= 2; // spacing after heading
      break;
    }
    case 'paragraph': {
      // Check if paragraph contains any images
      const hasImages = node.children.some((c) => c.type === 'image');
      if (hasImages) {
        // Render images and text segments separately
        let textBuf: PhrasingContent[] = [];
        for (const child of node.children) {
          if (child.type === 'image') {
            // Flush accumulated text first
            if (textBuf.length > 0) {
              renderPhrasingContent(ctx, textBuf, FONT_SIZE_BODY, xOffset);
              textBuf = [];
            }
            await renderImage(ctx, child.url);
          } else {
            textBuf.push(child);
          }
        }
        // Flush remaining text
        if (textBuf.length > 0) {
          renderPhrasingContent(ctx, textBuf, FONT_SIZE_BODY, xOffset);
        }
        ctx.y -= 8;
      } else {
        renderPhrasingContent(ctx, node.children, FONT_SIZE_BODY, xOffset);
        ctx.y -= 8;
      }
      break;
    }
    case 'blockquote': {
      await renderBlockquote(ctx, node.children);
      ctx.y -= 8; // gap after blockquote
      break;
    }
    case 'list': {
      await renderListItems(ctx, node.children as ListItem[], node.ordered ?? false, xOffset);
      ctx.y -= 4;
      break;
    }
    case 'table': {
      renderTable(ctx, node.children as TableRow[]);
      break;
    }
    case 'code': {
      const codeLines = node.value.split('\n');
      for (const line of codeLines) {
        drawWrappedText(ctx, line, ctx.fonts.courier, FONT_SIZE_CODE, COLOR_TEXT, xOffset);
      }
      ctx.y -= 4;
      break;
    }
    case 'thematicBreak': {
      ensureSpace(ctx, 16);
      ctx.y -= 8;
      ctx.page.drawLine({
        start: { x: MARGIN, y: ctx.y },
        end: { x: MARGIN + CONTENT_WIDTH, y: ctx.y },
        thickness: 1,
        color: COLOR_RULE,
      });
      ctx.y -= 8;
      break;
    }
    case 'html': {
      // Skip raw HTML blocks
      break;
    }
    default: {
      // Best-effort: try to extract text from unknown nodes
      if ('children' in node) {
        for (const child of (node as { children: RootContent[] }).children) {
          await renderNode(ctx, child, xOffset);
        }
      }
      break;
    }
  }
}

// --- Markdown parsing ---

function parseMarkdown(markdown: string): Root {
  const processor = unified().use(remarkParse).use(remarkGfm);
  return processor.parse(markdown);
}

// --- Title page rendering ---

async function renderDirectoryTitlePage(
  ctx: RenderContext,
  data: TitlePageData,
): Promise<void> {
  addPage(ctx);

  const centerX = PAGE_WIDTH / 2;
  let currentY = PAGE_HEIGHT - MARGIN - 120;

  // Profile picture (if available)
  if (data.profilePictureBytes && data.profilePictureBytes.length > 0) {
    try {
      let img: PDFImage;
      try {
        img = await ctx.doc.embedPng(data.profilePictureBytes);
      } catch {
        img = await ctx.doc.embedJpg(data.profilePictureBytes);
      }
      const imgSize = 100;
      ctx.page.drawImage(img, {
        x: centerX - imgSize / 2,
        y: currentY - imgSize,
        width: imgSize,
        height: imgSize,
      });
      currentY -= imgSize + 24;
    } catch {
      ctx.warnings.push('Failed to embed profile picture on title page');
    }
  }

  // Title: "<Name>'s Journal"
  const titleText = `${data.userName}'s Journal`;
  const titleWidth = ctx.fonts.montserratBold.widthOfTextAtSize(titleText, FONT_SIZE_TITLE_PAGE_NAME);
  ctx.page.drawText(titleText, {
    x: centerX - titleWidth / 2,
    y: currentY - FONT_SIZE_TITLE_PAGE_NAME,
    size: FONT_SIZE_TITLE_PAGE_NAME,
    font: ctx.fonts.montserratBold,
    color: COLOR_TEXT,
  });
  currentY -= FONT_SIZE_TITLE_PAGE_NAME + 12;

  // Year
  if (data.year) {
    const yearWidth = ctx.fonts.montserratRegular.widthOfTextAtSize(data.year, FONT_SIZE_TITLE_PAGE_YEAR);
    ctx.page.drawText(data.year, {
      x: centerX - yearWidth / 2,
      y: currentY - FONT_SIZE_TITLE_PAGE_YEAR,
      size: FONT_SIZE_TITLE_PAGE_YEAR,
      font: ctx.fonts.montserratRegular,
      color: COLOR_DIMMED,
    });
    currentY -= FONT_SIZE_TITLE_PAGE_YEAR + 24;
  }

  // App logo at the bottom
  if (data.logoBytes && data.logoBytes.length > 0) {
    try {
      const logo = await ctx.doc.embedPng(data.logoBytes);
      const logoMaxWidth = 160;
      const logoScale = Math.min(1, logoMaxWidth / logo.width);
      const logoW = logo.width * logoScale;
      const logoH = logo.height * logoScale;
      ctx.page.drawImage(logo, {
        x: centerX - logoW / 2,
        y: MARGIN + 30,
        width: logoW,
        height: logoH,
      });
    } catch {
      ctx.warnings.push('Failed to embed app logo on title page');
    }
  }
}

// --- Entry rendering ---

function renderEntryHeader(ctx: RenderContext, title: string, date: string): void {
  // Title
  drawWrappedText(ctx, title, ctx.fonts.montserratBold, FONT_SIZE_ENTRY_TITLE, COLOR_ENTRY_TITLE);
  ctx.y -= 2;
  // Date/time
  const dateDisplay = date.replace('_', ' ');
  drawWrappedText(ctx, dateDisplay, ctx.fonts.montserratRegular, FONT_SIZE_ENTRY_TIMESTAMP, COLOR_DIMMED);
  ctx.y -= 12;
}

async function renderEntryContent(ctx: RenderContext, markdown: string): Promise<void> {
  const tree = parseMarkdown(markdown);
  for (const node of tree.children) {
    await renderNode(ctx, node);
  }
}

// --- Public API ---

export async function renderDirectoryPdf(
  entries: ExportEntryData[],
  fonts: Record<string, ArrayBuffer>,
  images: Map<string, Uint8Array>,
  titlePageData: TitlePageData,
): Promise<{ pdfBytes: Uint8Array; warnings: string[] }> {
  const doc = await PDFDocument.create();
  const pdfFonts = await embedFonts(doc, fonts);
  const warnings: string[] = [];

  const ctx: RenderContext = {
    doc,
    fonts: pdfFonts,
    page: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    y: PAGE_HEIGHT - MARGIN,
    images,
    warnings,
  };

  // Remove placeholder page
  doc.removePage(0);

  // Title page
  await renderDirectoryTitlePage(ctx, titlePageData);

  // Entries (each on new page)
  for (const entry of entries) {
    addPage(ctx);
    renderEntryHeader(ctx, entry.title, entry.date);
    await renderEntryContent(ctx, entry.content);
  }

  const pdfBytes = await doc.save();
  return { pdfBytes: new Uint8Array(pdfBytes), warnings };
}
