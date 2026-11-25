export type Document = {
  key: string;
  name: string;
  required: boolean;
  status: string;
  rejectionReason: string | null;
};
export type Entry = {
  id: string;
  driverName: string;
  className: string;
  status: string;
  startNumber: string | null;
  vehicle: string;
  documents: Document[];
};
export type View = {
  eventName: string;
  startsOn: string;
  endsOn: string;
  entries: Entry[];
  messages: { subject: string; body: string; sentAt: string | null }[];
  payment: {
    status: string;
    totalCents: number;
    paidCents: number;
    onlinePayable: boolean;
    checkoutPending?: boolean;
    currency: string;
    paymentReference: string;
    accountName: string | null;
    iban: string | null;
    bic: string | null;
  } | null;
  editableFields: string[];
  contact: Record<string, string | null> | null;
};
