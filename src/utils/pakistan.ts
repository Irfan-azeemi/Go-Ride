import { BookingStatus } from '../types/goride';

export function formatPKR(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  return `PKR ${safe.toLocaleString('en-PK')}`;
}

export function isValidPakistanPhone(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-()]/g, '');
  return /^(\+92|92|0)?3[0-9]{9}$/.test(cleaned);
}

export function normalizePakistanPhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-()]/g, '');
  if (/^\+923[0-9]{9}$/.test(cleaned)) {
    return `+92 ${cleaned.slice(3, 6)} ${cleaned.slice(6)}`;
  }
  if (/^923[0-9]{9}$/.test(cleaned)) {
    return `+92 ${cleaned.slice(2, 5)} ${cleaned.slice(5)}`;
  }
  if (/^03[0-9]{9}$/.test(cleaned)) {
    return `+92 ${cleaned.slice(1, 4)} ${cleaned.slice(4)}`;
  }
  if (/^3[0-9]{9}$/.test(cleaned)) {
    return `+92 ${cleaned.slice(0, 3)} ${cleaned.slice(3)}`;
  }
  return phone.trim();
}

export function getKarachiDateString(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function getKarachiTimeString(date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatKarachiTimestamp(ts: unknown): string {
  if (!ts) return 'Just now';
  let d: Date | null = null;
  if (ts instanceof Date) {
    d = ts;
  } else if (typeof ts === 'object' && ts !== null && 'toDate' in ts && typeof (ts as { toDate: () => Date }).toDate === 'function') {
    d = (ts as { toDate: () => Date }).toDate();
  } else if (typeof ts === 'number' || typeof ts === 'string') {
    d = new Date(ts);
  }
  if (!d || Number.isNaN(d.getTime())) return 'Just now';

  return new Intl.DateTimeFormat('en-PK', {
    timeZone: 'Asia/Karachi',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

export function safeImageSrc(url?: string): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('/src/') ||
    /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(trimmed)
  ) {
    return trimmed;
  }
  return '';
}

export async function compressImageFileToDataUrl(
  file: File,
  maxSize = 180,
  maxLength = 14000
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a valid image file (PNG, JPG, or WebP).');
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Invalid image format.'));
    image.src = dataUrl;
  });

  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const width = Math.max(32, Math.round(img.width * scale));
  const height = Math.max(32, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable.');
  ctx.drawImage(img, 0, 0, width, height);

  let quality = 0.72;
  let result = canvas.toDataURL('image/jpeg', quality);
  while (result.length > maxLength && quality > 0.25) {
    quality -= 0.12;
    result = canvas.toDataURL('image/jpeg', quality);
  }
  if (result.length > maxLength) {
    throw new Error('Image is too large even after compression. Please pick a smaller file.');
  }
  return result;
}

export function getStatusDisplay(status: BookingStatus): {
  textClass: string;
  dotClass: string;
  label: string;
} {
  switch (status) {
    case 'Pending':
      return { textClass: 'text-amber-700', dotClass: 'bg-amber-500', label: 'Pending Review' };
    case 'Accepted':
      return { textClass: 'text-[#155EEF]', dotClass: 'bg-[#155EEF]', label: 'Accepted' };
    case 'Driver Assigned':
      return { textClass: 'text-indigo-700', dotClass: 'bg-indigo-600', label: 'Driver Assigned' };
    case 'In Progress':
      return { textClass: 'text-sky-700', dotClass: 'bg-sky-600', label: 'In Progress' };
    case 'Completed':
      return { textClass: 'text-emerald-700', dotClass: 'bg-emerald-600', label: 'Completed' };
    case 'Rejected':
      return { textClass: 'text-rose-700', dotClass: 'bg-rose-600', label: 'Rejected' };
    case 'Cancelled':
      return { textClass: 'text-slate-600', dotClass: 'bg-slate-400', label: 'Cancelled' };
    default:
      return { textClass: 'text-slate-700', dotClass: 'bg-slate-400', label: status };
  }
}

export function generateId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`;
}
