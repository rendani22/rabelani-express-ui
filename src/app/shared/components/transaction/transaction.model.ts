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
  counterparty: string;
  counterpartyImage: string;
  paymentDate: string;
  status: 'Pending' | 'Completed' | 'Canceled' | 'In Transit' | 'Ready';
  amount?: number;
  notes?: string;
  details?: TransactionDetails;
}

