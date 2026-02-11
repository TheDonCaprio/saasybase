import React from 'react';
import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';
import { formatDate } from './formatDate';
import { formatDateServer } from './formatDate.server';
import { formatCurrency } from './utils/currency';
// formatDate is intentionally imported for potential client-side formatting helpers
// and may be unused in this server-side module; mark it to avoid lint noise in some builds
void formatDate;
import { pluralize } from './pluralize';

interface InvoiceData {
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

// Create styles
const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    padding: 40,
    fontFamily: 'Helvetica',
  },
  header: {
    marginBottom: 30,
  },
  title: {
    fontSize: 24,
    color: '#2D3748',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 12,
    color: '#4A5568',
    marginBottom: 20,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    color: '#2D3748',
    marginBottom: 8,
  },
  text: {
    fontSize: 10,
    color: '#4A5568',
    marginBottom: 4,
  },
  label: {
    fontSize: 9,
    color: '#718096',
    marginBottom: 2,
  },
  table: {
    marginTop: 20,
    border: 1,
    borderColor: '#E2E8F0',
  },
  tableHeader: {
    backgroundColor: '#F7FAFC',
    padding: 8,
    borderBottom: 1,
    borderBottomColor: '#E2E8F0',
  },
  tableRow: {
    padding: 8,
    borderBottom: 1,
    borderBottomColor: '#E2E8F0',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tableHeaderText: {
    fontSize: 10,
    color: '#2D3748',
  },
  tableText: {
    fontSize: 10,
    color: '#4A5568',
  },
  total: {
    marginTop: 10,
    paddingTop: 10,
    borderTop: 2,
    borderTopColor: '#2D3748',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#2D3748',
  },
  footer: {
    marginTop: 40,
    paddingTop: 20,
    borderTop: 1,
    borderTopColor: '#E2E8F0',
  },
  footerText: {
    fontSize: 8,
    color: '#A0AEC0',
    marginBottom: 4,
  },
});

// Invoice Document Component
const InvoiceDocument: React.FC<{ data: InvoiceData & { formatted?: { paymentDate?: string; servicePeriod?: string } } }> = ({ data }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      {(() => {
        const subtotalCents = data.payment.subtotalCents ?? data.payment.amountCents;
        const discountCents = data.payment.discountCents ?? Math.max(0, subtotalCents - data.payment.amountCents);
        const hasDiscount = (discountCents ?? 0) > 0;
        const currency = data.payment.currency.toUpperCase();
        const couponLabel = data.payment.couponCode ? `Coupon (${data.payment.couponCode})` : 'Discount';
        return (
          <>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{data.settings.siteName}</Text>
        <Text style={styles.subtitle}>Invoice</Text>
        
        <Text style={styles.label}>Invoice #</Text>
        <Text style={styles.text}>{data.payment.id}</Text>
        
    <Text style={styles.label}>Date</Text>
  <Text style={styles.text}>{data.formatted?.paymentDate || ''}</Text>
        
        <Text style={styles.label}>Status</Text>
        <Text style={styles.text}>{data.payment.status}</Text>
        {data.payment.stripePaymentIntentId && (
          <>
            <Text style={styles.label}>Stripe Payment Intent ID</Text>
            <Text style={styles.text}>{data.payment.stripePaymentIntentId}</Text>
          </>
        )}
        {data.subscription?.stripeSubscriptionId && (
          <>
            <Text style={styles.label}>Stripe Subscription ID</Text>
            <Text style={styles.text}>{data.subscription.stripeSubscriptionId}</Text>
          </>
        )}
      </View>

      {/* Customer Details */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Bill To:</Text>
        <Text style={styles.text}>{data.user.name || 'Customer'}</Text>
        <Text style={styles.text}>{data.user.email || 'N/A'}</Text>
      </View>

      {/* Service Details */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Service Details:</Text>
        <Text style={styles.text}>Plan: {data.plan?.name || 'Pro Plan'}</Text>
        <Text style={styles.text}>Description: {data.plan?.description || 'Premium subscription'}</Text>
        <Text style={styles.text}>
          Duration: {data.plan ? pluralize(Math.round(data.plan.durationHours / 24), 'day') : pluralize(30, 'day')}
        </Text>
        {data.subscription && (
          <Text style={styles.text}>
            Service Period: {data.formatted?.servicePeriod || ''}
          </Text>
        )}
        {hasDiscount && (
          <Text style={styles.text}>
            Coupon Applied: {data.payment.couponCode || '—'} (−{formatCurrency(discountCents, currency)})
          </Text>
        )}
        <Text style={styles.text}>
          Amount Paid: {formatCurrency(data.payment.amountCents, currency)}
        </Text>
      </View>

      {/* Payment Summary Table */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payment Summary:</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.tableHeaderText}>Description</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableText}>{data.plan?.name || 'Pro Plan'} (Subtotal)</Text>
            <Text style={styles.tableText}>
              {formatCurrency(subtotalCents, currency)}
            </Text>
          </View>
          {hasDiscount && (
            <View style={styles.tableRow}>
              <Text style={styles.tableText}>{couponLabel}</Text>
              <Text style={styles.tableText}>
                -{formatCurrency(discountCents, currency)}
              </Text>
            </View>
          )}
          <View style={styles.total}>
            <Text style={styles.totalText}>Total:</Text>
            <Text style={styles.totalText}>
              {formatCurrency(data.payment.amountCents, currency)}
            </Text>
          </View>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Thank you for your business!</Text>
        <Text style={styles.footerText}>For support, contact: {data.settings.supportEmail}</Text>
      </View>
          </>
        );
      })()}
    </Page>
  </Document>
);

export async function createInvoicePDF(data: InvoiceData): Promise<Buffer> {
  try {
  // compute formatted strings using server helper so the invoice respects admin settings
  const paymentDate = await formatDateServer(data.payment.createdAt);
  const servicePeriod = data.subscription ? await formatDateServer(data.subscription.startedAt) + ' - ' + await formatDateServer(data.subscription.expiresAt) : '';

  const doc = <InvoiceDocument data={{ ...data, formatted: { paymentDate, servicePeriod } }} />;
    
    // For React PDF 3.x, need to use arrayBuffer approach
    const blob = await pdf(doc).toBlob();
    const arrayBuffer = await blob.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error('Error creating PDF:', error);
    throw new Error(`PDF generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
