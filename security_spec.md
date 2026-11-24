# GoRide Security Specification & Data Invariants

## 1. Core Data Invariants
1. **Customer Ownership & PII Isolation**: A user document `/users/{uid}` is strictly readable and writable only by the owning authenticated UID or an authorized administrator. Customers can never escalate `role` from `"customer"` to `"admin"`.
2. **Admin Authorization**: Administrative actions (managing vehicles, drivers, fare rates, customer directory, and approving/assigning bookings) require either the verified bootstrapped owner email (`lancerfree645@gmail.com` with `email_verified == true`) or a verified UID entry in `/admins/{uid}`. Public admin registration is strictly blocked.
3. **Booking Lifecycle Integrity**: Every newly created booking must bind `customerId == request.auth.uid`, initialize `status == "Pending"`, and use server-verified timestamps (`request.time`).
4. **Customer Update Scope & Terminal State Locking**: Customers may only transition their own booking from `"Pending"` to `"Cancelled"`, modifying only `["status", "updatedAt"]`. Once a booking is `"Completed"`, `"Cancelled"`, or `"Rejected"`, non-admin updates are blocked.
5. **Driver PII Isolation**: The `/drivers/{driverId}` collection (containing phone numbers and license numbers) is readable and writable only by authorized admins. Assigned driver contact details are projected onto the specific booking by the admin when assigning a driver.
6. **Strict Schema & Payload Bounds**: Every write validates required/allowed keys (`hasAll` + `hasOnly`), string length limits, numeric bounds, enum allowlists, and `^[a-zA-Z0-9_\-]+$` ID patterns.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Privilege Escalation on Signup**: `POST /users/cust_1` with `{ role: "admin" }` -> `PERMISSION_DENIED`.
2. **Role Mutation on Profile Update**: `PATCH /users/cust_1` changing `role` to `"admin"` -> `PERMISSION_DENIED`.
3. **Cross-User PII Read**: Authenticated `cust_2` attempts `GET /users/cust_1` -> `PERMISSION_DENIED`.
4. **Unverified Admin Email Spoof**: User with unverified `email_verified: false` claiming admin email attempts `POST /admins/spoof_1` -> `PERMISSION_DENIED`.
5. **Public Admin Self-Registration**: Normal customer attempts `POST /admins/cust_1` -> `PERMISSION_DENIED`.
6. **Booking Identity Spoofing**: `cust_2` attempts `POST /bookings/b_1` with `customerId: "cust_1"` -> `PERMISSION_DENIED`.
7. **Booking State Shortcutting**: `cust_1` attempts `POST /bookings/b_1` with `status: "Completed"` -> `PERMISSION_DENIED`.
8. **Customer Fare Tampering**: `cust_1` attempts `PATCH /bookings/b_1` altering `fare: 1` while cancelling -> `PERMISSION_DENIED`.
9. **Terminal State Reopening**: `cust_1` attempts `PATCH /bookings/b_completed` changing `status` to `"Pending"` -> `PERMISSION_DENIED`.
10. **Shadow / Ghost Field Injection**: `cust_1` attempts `POST /bookings/b_1` with extra `{ isPaidOverride: true }` -> `PERMISSION_DENIED`.
11. **ID Poisoning (Denial of Wallet)**: `cust_1` attempts `POST /bookings/../../evil` or 1KB ID -> `PERMISSION_DENIED`.
12. **Driver Directory Scraping**: `cust_1` attempts `LIST /drivers` -> `PERMISSION_DENIED`.
