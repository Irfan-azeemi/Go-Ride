/**
 * GoRide Security Rules Test Specification (Dirty Dozen Adversarial Suite)
 * Validates that every unauthorized payload is rejected with PERMISSION_DENIED.
 */

export interface SecurityTestCase {
  id: string;
  title: string;
  collection: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  actor: { uid: string | null; email?: string; email_verified?: boolean; isAdmin?: boolean };
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED' | 'ALLOW';
}

export const DIRTY_DOZEN_CASES: SecurityTestCase[] = [
  {
    id: 'DD-01',
    title: 'Privilege Escalation on User Signup',
    collection: 'users/cust_1',
    operation: 'create',
    actor: { uid: 'cust_1', email: 'user@example.com', email_verified: true },
    payload: { uid: 'cust_1', fullName: 'Ali Khan', email: 'user@example.com', phone: '+923001234567', role: 'admin' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-02',
    title: 'Role Mutation on Profile Update',
    collection: 'users/cust_1',
    operation: 'update',
    actor: { uid: 'cust_1', email: 'user@example.com', email_verified: true },
    payload: { role: 'admin' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-03',
    title: 'Cross-User PII Read',
    collection: 'users/cust_1',
    operation: 'get',
    actor: { uid: 'cust_2', email: 'other@example.com', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-04',
    title: 'Unverified Admin Email Spoof',
    collection: 'admins/spoof_1',
    operation: 'create',
    actor: { uid: 'spoof_1', email: 'lancerfree645@gmail.com', email_verified: false },
    payload: { uid: 'spoof_1', name: 'Spoofer', email: 'lancerfree645@gmail.com', role: 'super_admin' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-05',
    title: 'Public Admin Self-Registration',
    collection: 'admins/cust_1',
    operation: 'create',
    actor: { uid: 'cust_1', email: 'user@example.com', email_verified: true },
    payload: { uid: 'cust_1', name: 'Rogue Admin', email: 'user@example.com', role: 'admin' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-06',
    title: 'Booking Identity Spoofing',
    collection: 'bookings/bk_101',
    operation: 'create',
    actor: { uid: 'cust_2', email: 'other@example.com', email_verified: true },
    payload: { bookingId: 'bk_101', customerId: 'cust_1', status: 'Pending' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-07',
    title: 'Booking State Shortcutting on Create',
    collection: 'bookings/bk_102',
    operation: 'create',
    actor: { uid: 'cust_1', email: 'user@example.com', email_verified: true },
    payload: { bookingId: 'bk_102', customerId: 'cust_1', status: 'Completed' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-08',
    title: 'Customer Fare Tampering on Cancel',
    collection: 'bookings/bk_101',
    operation: 'update',
    actor: { uid: 'cust_1', email: 'user@example.com', email_verified: true },
    payload: { status: 'Cancelled', fare: 1 },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-09',
    title: 'Terminal State Reopening by Customer',
    collection: 'bookings/bk_completed',
    operation: 'update',
    actor: { uid: 'cust_1', email: 'user@example.com', email_verified: true },
    payload: { status: 'Pending' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-10',
    title: 'Shadow Field Injection on Booking',
    collection: 'bookings/bk_103',
    operation: 'create',
    actor: { uid: 'cust_1', email: 'user@example.com', email_verified: true },
    payload: { bookingId: 'bk_103', customerId: 'cust_1', status: 'Pending', isPaidOverride: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-11',
    title: 'Path Variable ID Poisoning',
    collection: 'bookings/invalid..id!@#',
    operation: 'create',
    actor: { uid: 'cust_1', email: 'user@example.com', email_verified: true },
    payload: { bookingId: 'invalid..id!@#', customerId: 'cust_1', status: 'Pending' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-12',
    title: 'Driver PII Directory Scraping',
    collection: 'drivers',
    operation: 'list',
    actor: { uid: 'cust_1', email: 'user@example.com', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
];
