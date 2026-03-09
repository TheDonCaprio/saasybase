import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib';
import { formatDateServer } from './formatDate.server';
import { pluralize } from './pluralize';
import { formatCurrency } from './utils/currency';

interface RefundData {
  payment: {
    id: string;
    amountCents: number;
    currency: string;
    status: string;
    createdAt: Date;
    subtotalCents?: number | null;
    discountCents?: number | null;
    couponCode?: string | null;
    externalPaymentId?: string | null;
  };
  refund: {
    id: string;
    amount: number;
    status?: string | null;
    created?: number | null;
  } | null;
  user: {
    email: string | null;
    name: string | null;
  };
  subscription?: {
    id: string;
    startedAt: Date;
    expiresAt: Date;
    externalSubscriptionId?: string | null;
  } | null;
  plan?: {
    name: string;
    description: string | null;
    durationHours: number;
  } | null;
  settings: {
    siteName: string;
    supportEmail: string;
  };
}

type LayoutContext = {
  pdfDoc: PDFDocument;
  page: PDFPage;
  fontRegular: PDFFont;
  fontBold: PDFFont;
  y: number;
  margin: number;
  width: number;
  lineHeight: number;
};

function toPdfText(value: unknown, fallback = ''): string {
  if (value == null) return fallback;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  return fallback;
}

function ensureRoom(ctx: LayoutContext, lines = 1) {
  const required = lines * ctx.lineHeight;
  if (ctx.y - required > 36) return;
  ctx.page = ctx.pdfDoc.addPage([595.28, 841.89]);
  ctx.y = 806;
}

function drawTextLine(
  ctx: LayoutContext,
  text: string,
  opts?: {
    size?: number;
    bold?: boolean;
    color?: { r: number; g: number; b: number };
    indent?: number;
    spacingAfter?: number;
  }
) {
  const size = opts?.size ?? 10;
  const bold = opts?.bold ?? false;
  const font = bold ? ctx.fontBold : ctx.fontRegular;
  const indent = opts?.indent ?? 0;
  const colorObj = opts?.color ?? { r: 0.29, g: 0.33, b: 0.41 };

  ensureRoom(ctx, 1);
  ctx.page.drawText(text, {
    x: ctx.margin + indent,
    y: ctx.y,
    size,
    font,
    color: rgb(colorObj.r, colorObj.g, colorObj.b),
    maxWidth: ctx.width - indent,
  });

  ctx.y -= opts?.spacingAfter ?? ctx.lineHeight;
}

function drawSectionTitle(ctx: LayoutContext, text: string) {
  ctx.y -= 6;
  drawTextLine(ctx, text, {
    size: 13,
    bold: true,
    color: { r: 0.176, g: 0.216, b: 0.282 },
    spacingAfter: 14,
  });
}

function drawDivider(ctx: LayoutContext) {
  ensureRoom(ctx, 1);
  ctx.page.drawLine({
    start: { x: ctx.margin, y: ctx.y },
    end: { x: ctx.margin + ctx.width, y: ctx.y },
    thickness: 1,
    color: rgb(0.886, 0.91, 0.941),
  });
  ctx.y -= 12;
}

export async function createRefundPDF(data: RefundData): Promise<Buffer> {
  const refundDate = data.refund?.created ? new Date(data.refund.created * 1000) : new Date();
  const paymentDate = await formatDateServer(data.payment.createdAt);
  const refundDateFormatted = await formatDateServer(refundDate);

  const subtotalCents = data.payment.subtotalCents ?? data.payment.amountCents;
  const discountCents = data.payment.discountCents ?? Math.max(0, subtotalCents - data.payment.amountCents);
  const hasDiscount = discountCents > 0;
  const currency = toPdfText(data.payment.currency, 'USD').toUpperCase();
  const refundAmount = data.refund ? data.refund.amount : data.payment.amountCents;

  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const page = pdfDoc.addPage([595.28, 841.89]);

  const ctx: LayoutContext = {
    pdfDoc,
    page,
    fontRegular,
    fontBold,
    y: 806,
    margin: 40,
    width: 595.28 - 80,
    lineHeight: 14,
  };

  drawTextLine(ctx, toPdfText(data.settings.siteName, 'Receipt'), {
    size: 24,
    bold: true,
    color: { r: 0.176, g: 0.216, b: 0.282 },
    spacingAfter: 18,
  });
  drawTextLine(ctx, 'Refund Receipt', { size: 12, color: { r: 0.29, g: 0.33, b: 0.41 }, spacingAfter: 18 });

  drawTextLine(ctx, 'Refund ID', { size: 9, color: { r: 0.443, g: 0.51, b: 0.588 }, spacingAfter: 12 });
  drawTextLine(ctx, toPdfText(data.refund?.id, 'N/A'));

  drawTextLine(ctx, 'Refund Date', { size: 9, color: { r: 0.443, g: 0.51, b: 0.588 }, spacingAfter: 12 });
  drawTextLine(ctx, toPdfText(refundDateFormatted));

  drawTextLine(ctx, 'Original Transaction', { size: 9, color: { r: 0.443, g: 0.51, b: 0.588 }, spacingAfter: 12 });
  drawTextLine(ctx, toPdfText(data.payment.id, 'N/A'));

  drawTextLine(ctx, 'Status', { size: 9, color: { r: 0.443, g: 0.51, b: 0.588 }, spacingAfter: 12 });
  drawTextLine(ctx, toPdfText(data.refund?.status ?? data.payment.status, 'N/A'));

  drawDivider(ctx);

  drawSectionTitle(ctx, 'Customer:');
  drawTextLine(ctx, toPdfText(data.user.name, 'Customer'));
  drawTextLine(ctx, toPdfText(data.user.email, 'N/A'));

  drawDivider(ctx);

  drawSectionTitle(ctx, 'Refund Details:');
  drawTextLine(ctx, `Refunded Amount: ${formatCurrency(refundAmount, currency)}`);
  drawTextLine(ctx, `Original Amount: ${formatCurrency(data.payment.amountCents, currency)}`);
  if (hasDiscount) {
    drawTextLine(
      ctx,
      `Coupon Applied: ${toPdfText(data.payment.couponCode, '—')} (-${formatCurrency(discountCents, currency)})`
    );
  }
  drawTextLine(ctx, `Payment Date: ${toPdfText(paymentDate)}`);

  drawDivider(ctx);

  drawSectionTitle(ctx, 'Service Details:');
  drawTextLine(ctx, `Plan: ${toPdfText(data.plan?.name, 'Pro Plan')}`);
  drawTextLine(ctx, `Description: ${toPdfText(data.plan?.description, 'Premium subscription')}`);
  drawTextLine(
    ctx,
    `Duration: ${data.plan ? pluralize(Math.round(data.plan.durationHours / 24), 'day') : pluralize(30, 'day')}`
  );

  drawDivider(ctx);

  drawTextLine(ctx, `For support, contact: ${toPdfText(data.settings.supportEmail, 'N/A')}`, {
    size: 9,
    color: { r: 0.627, g: 0.682, b: 0.753 },
  });

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
