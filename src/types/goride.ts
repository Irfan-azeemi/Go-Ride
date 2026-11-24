export type VehicleType = 'car' | 'bike';

export type VehicleAvailability = 'Available' | 'On Trip' | 'Maintenance';

export type DriverAvailability = 'Available' | 'Assigned' | 'Off Duty';

export type BookingStatus =
  | 'Pending'
  | 'Accepted'
  | 'Rejected'
  | 'Driver Assigned'
  | 'In Progress'
  | 'Completed'
  | 'Cancelled';

export interface LatLngLiteral {
  lat: number;
  lng: number;
}

export interface UserProfile {
  uid: string;
  fullName: string;
  email: string;
  phone: string;
  role: 'customer' | 'admin';
  profileImage?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AdminRecord {
  uid: string;
  name: string;
  email: string;
  role: 'admin' | 'super_admin';
  createdAt?: unknown;
}

export interface Vehicle {
  vehicleId: string;
  name: string;
  type: VehicleType;
  model: string;
  seats: number;
  pricePerKm: number;
  baseFare: number;
  availability: VehicleAvailability;
  imageUrl: string;
  plateNumber?: string;
  city?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Driver {
  driverId: string;
  fullName: string;
  phone: string;
  vehicleType: VehicleType;
  licenseNumber: string;
  availability: DriverAvailability;
  rating?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface FareConfig {
  carBaseFare: number;
  carPerKm: number;
  bikeBaseFare: number;
  bikePerKm: number;
  minimumFare: number;
  peakMultiplier: number;
  updatedAt?: unknown;
}

export interface Booking {
  bookingId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  vehicleType: VehicleType;
  vehicleId?: string;
  vehicleName?: string;
  assignedDriverId?: string;
  assignedDriverName?: string;
  assignedDriverPhone?: string;
  pickupLocation: string;
  pickupLat?: number;
  pickupLng?: number;
  destination: string;
  destLat?: number;
  destLng?: number;
  pickupDate: string;
  pickupTime: string;
  distance: number;
  durationMinutes?: number;
  fare: number;
  specialInstructions?: string;
  status: BookingStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AppNotification {
  notificationId: string;
  userId: string;
  bookingId?: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  createdAt?: unknown;
}
