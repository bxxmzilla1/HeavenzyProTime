export type UserRole = 'admin' | 'worker';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  jobTitle?: string;
  role: UserRole;
  deviceCode?: string;
  createdAt: string;
  hourlyRate?: number;
  currency?: 'PHP';
}

export interface TimeLog {
  id?: string;
  uid: string;
  type: 'in' | 'out' | 'break_start' | 'break_end';
  timestamp: any; // Firestore Timestamp
  location: {
    lat: number;
    lng: number;
  };
  deviceCode: string;
}
