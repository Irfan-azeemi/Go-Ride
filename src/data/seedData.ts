import { collection, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Driver, FareConfig, Vehicle } from '../types/goride';

export const HERO_BANNER_IMAGE = '/src/assets/images/hero_goride_pakistan_1795462969140.jpg';

export const DEFAULT_FARE_CONFIG: FareConfig = {
  carBaseFare: 250,
  carPerKm: 75,
  bikeBaseFare: 80,
  bikePerKm: 32,
  minimumFare: 150,
  peakMultiplier: 1.0,
};

export const DEFAULT_VEHICLES: Omit<Vehicle, 'createdAt' | 'updatedAt'>[] = [
  {
    vehicleId: 'veh_corolla_altis',
    name: 'Toyota Corolla Altis',
    type: 'car',
    model: '2024 · Automatic AC Sedan',
    seats: 4,
    pricePerKm: 75,
    baseFare: 250,
    availability: 'Available',
    imageUrl: '/src/assets/images/car_sedan_comfort_1795462969923.jpg',
    plateNumber: 'LEA-4821',
    city: 'Lahore',
  },
  {
    vehicleId: 'veh_sportage_exec',
    name: 'Kia Sportage Executive',
    type: 'car',
    model: '2024 · AWD Crossover SUV',
    seats: 5,
    pricePerKm: 110,
    baseFare: 400,
    availability: 'Available',
    imageUrl: '/src/assets/images/car_suv_executive_1795462970027.jpg',
    plateNumber: 'ICT-9042',
    city: 'Islamabad',
  },
  {
    vehicleId: 'veh_swift_city',
    name: 'Suzuki Swift GLX',
    type: 'car',
    model: '2024 · Compact City Hatchback',
    seats: 4,
    pricePerKm: 62,
    baseFare: 200,
    availability: 'Available',
    imageUrl: '/src/assets/images/car_hatchback_city_1795462970431.jpg',
    plateNumber: 'KHI-7319',
    city: 'Karachi',
  },
  {
    vehicleId: 'veh_honda_125',
    name: 'Honda CB 125F',
    type: 'bike',
    model: '2025 · Urban Commuter',
    seats: 1,
    pricePerKm: 32,
    baseFare: 80,
    availability: 'Available',
    imageUrl: '/src/assets/images/bike_commuter_ride_1795462971351.jpg',
    plateNumber: 'LHR-8814',
    city: 'Lahore',
  },
  {
    vehicleId: 'veh_yamaha_150',
    name: 'Suzuki GS 150 Express',
    type: 'bike',
    model: '2025 · Highway Sport',
    seats: 1,
    pricePerKm: 38,
    baseFare: 100,
    availability: 'Available',
    imageUrl: '/src/assets/images/bike_sport_express_1795462971839.jpg',
    plateNumber: 'KHI-3105',
    city: 'Karachi',
  },
];

export const DEFAULT_DRIVERS: Omit<Driver, 'createdAt' | 'updatedAt'>[] = [
  {
    driverId: 'drv_usman_tariq',
    fullName: 'Usman Tariq',
    phone: '+92 300 4128890',
    vehicleType: 'car',
    licenseNumber: 'PK-LHR-884210',
    availability: 'Available',
    rating: 4.9,
  },
  {
    driverId: 'drv_bilal_ahmed',
    fullName: 'Bilal Ahmed',
    phone: '+92 321 9845120',
    vehicleType: 'car',
    licenseNumber: 'PK-KHI-552104',
    availability: 'Available',
    rating: 4.8,
  },
  {
    driverId: 'drv_hamza_raza',
    fullName: 'Hamza Raza',
    phone: '+92 333 7712045',
    vehicleType: 'bike',
    licenseNumber: 'PK-ISB-220198',
    availability: 'Available',
    rating: 4.9,
  },
  {
    driverId: 'drv_farhan_siddiqui',
    fullName: 'Farhan Siddiqui',
    phone: '+92 345 6610934',
    vehicleType: 'bike',
    licenseNumber: 'PK-KHI-991042',
    availability: 'Available',
    rating: 4.7,
  },
];

export async function seedInitialFleetAndConfig(): Promise<void> {
  try {
    const vehiclesSnap = await getDocs(collection(db, 'vehicles'));
    if (vehiclesSnap.empty) {
      for (const v of DEFAULT_VEHICLES) {
        await setDoc(doc(db, 'vehicles', v.vehicleId), {
          ...v,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }

    const fareSnap = await getDocs(collection(db, 'fareConfig'));
    if (fareSnap.empty) {
      await setDoc(doc(db, 'fareConfig', 'default'), {
        ...DEFAULT_FARE_CONFIG,
        updatedAt: serverTimestamp(),
      });
    }

    const driversSnap = await getDocs(collection(db, 'drivers'));
    if (driversSnap.empty) {
      for (const d of DEFAULT_DRIVERS) {
        await setDoc(doc(db, 'drivers', d.driverId), {
          ...d,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'vehicles/fareConfig/drivers');
  }
}
