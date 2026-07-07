/** Transaction details for the details panel */
export interface TransactionDetails {
  timestamp?: string;
  iban?: string;
  bic?: string;
  reference?: string;
  emitter?: string;
  notes?: string;
  receipts?: string[];
}

/** Transaction model for table display and details panel */
export interface Transaction {
  id: string;
  reference?: string;
  /** Purchase-order / order number associated with the transaction */
  orderNumber?: string;
  counterparty: string;
  counterpartyImage: string;
  paymentDate: string;
  /** ISO timestamp for the created/paid date (used to compute relative times) */
  paymentDateIso?: string;
  /** Last updated date for the transaction (mapped from package.updated_at) */
  lastUpdated?: string;
  /** ISO timestamp for the last-updated value (used to compute relative times) */
  lastUpdatedIso?: string;
  // Added 'Collected' so collected packages display the correct label in the
  // status column instead of being lumped under "Completed".
  status: 'Draft' | 'Pending' | 'Notified' | 'Completed' | 'Collected' | 'Canceled' | 'In Transit' | 'Ready';
  amount?: number;
  notes?: string;
  details?: TransactionDetails;
}

