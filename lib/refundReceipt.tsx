import React from 'react';
import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';
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
    stripePaymentIntentId?: string | null;
  };
  refund: {
    id: string;
    amount: number; // cents
    status?: string | null;
    created?: number | null; // epoch seconds
  } | null;
  user: {
    email: string | null;
    name: string | null;
  };
  subscription?: {
    id: string;
    startedAt: Date;
    expiresAt: Date;
    stripeSubscriptionId?: string | null;
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

const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    padding: 40,
    fontFamily: 'Helvetica',
  },
  header: { marginBottom: 30 },
  title: { fontSize: 24, color: '#2D3748', marginBottom: 10 },
  subtitle: { fontSize: 12, color: '#4A5568', marginBottom: 20 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 14, color: '#2D3748', marginBottom: 8 },
  text: { fontSize: 10, color: '#4A5568', marginBottom: 4 },
  label: { fontSize: 9, color: '#718096', marginBottom: 2 },
  table: { marginTop: 20, border: 1, borderColor: '#E2E8F0' },
  tableHeader: { backgroundColor: '#F7FAFC', padding: 8, borderBottom: 1, borderBottomColor: '#E2E8F0' },
  tableRow: { padding: 8, borderBottom: 1, borderBottomColor: '#E2E8F0', flexDirection: 'row', justifyContent: 'space-between' },
  tableHeaderText: { fontSize: 10, color: '#2D3748' },
  tableText: { fontSize: 10, color: '#4A5568' },
  total: { marginTop: 10, paddingTop: 10, borderTop: 2, borderTopColor: '#2D3748', flexDirection: 'row', justifyContent: 'space-between' },
  totalText: { fontSize: 12, fontWeight: 'bold', color: '#2D3748' },
  footer: { marginTop: 40, paddingTop: 20, borderTop: 1, borderTopColor: '#E2E8F0' },
  footerText: { fontSize: 8, color: '#A0AEC0', marginBottom: 4 },
});

const RefundDocument: React.FC<{ data: RefundData & { formatted?: { refundDate?: string; paymentDate?: string; servicePeriod?: string } } }> = ({ data }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      {(() => {
        const subtotalCents = data.payment.subtotalCents ?? data.payment.amountCents;
        const discountCents = data.payment.discountCents ?? Math.max(0, subtotalCents - data.payment.amountCents);
        const hasDiscount = (discountCents ?? 0) > 0;
        const currency = data.payment.currency.toUpperCase();
        const refundAmount = data.refund ? data.refund.amount : data.payment.amountCents;
        const refundDate = data.formatted?.refundDate || '';
        const paymentDate = data.formatted?.paymentDate || '';
        
        return (
          <>
            <View style={styles.header}>
              <Text style={styles.title}>{data.settings.siteName}</Text>
              <Text style={styles.subtitle}>Refund Receipt</Text>

              <Text style={styles.label}>Refund ID</Text>
              <Text style={styles.text}>{data.refund?.id ?? 'N/A'}</Text>

              <Text style={styles.label}>Refund Date</Text>
              <Text style={styles.text}>{refundDate}</Text>

              <Text style={styles.label}>Original Transaction</Text>
              <Text style={styles.text}>{data.payment.id}</Text>

              <Text style={styles.label}>Status</Text>
              <Text style={styles.text}>{data.refund?.status ?? data.payment.status}</Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Customer:</Text>
              <Text style={styles.text}>{data.user.name || 'Customer'}</Text>
              <Text style={styles.text}>{data.user.email || 'N/A'}</Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Refund Details:</Text>
              <Text style={styles.text}>Refunded Amount: {formatCurrency(refundAmount, currency)}</Text>
              <Text style={styles.text}>Original Amount: {formatCurrency(data.payment.amountCents, currency)}</Text>
              {hasDiscount && (
                <Text style={styles.text}>Coupon Applied: {data.payment.couponCode || '—'} (−{formatCurrency(discountCents, currency)})</Text>
              )}
              <Text style={styles.text}>Payment Date: {paymentDate}</Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Service Details:</Text>
              <Text style={styles.text}>Plan: {data.plan?.name || 'Pro Plan'}</Text>
              <Text style={styles.text}>Description: {data.plan?.description || 'Premium subscription'}</Text>
              <Text style={styles.text}>Duration: {data.plan ? pluralize(Math.round(data.plan.durationHours / 24), 'day') : pluralize(30, 'day')}</Text>
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>For support, contact: {data.settings.supportEmail}</Text>
            </View>
          </>
        );
      })()}
    </Page>
  </Document>
);

export async function createRefundPDF(data: RefundData): Promise<Buffer> {
  try {
    const refundDate = data.refund?.created ? new Date(data.refund.created * 1000) : new Date();
    const paymentDate = await formatDateServer(data.payment.createdAt);
    const refundDateFormatted = await formatDateServer(refundDate);
    const servicePeriod = data.subscription ? await formatDateServer(data.subscription.startedAt) + ' - ' + await formatDateServer(data.subscription.expiresAt) : '';

    const doc = <RefundDocument data={{ ...data, formatted: { refundDate: refundDateFormatted, paymentDate, servicePeriod } }} />;
    const blob = await pdf(doc).toBlob();
    const arrayBuffer = await blob.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error('Error creating refund PDF:', error);
    throw new Error(`Refund PDF generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
