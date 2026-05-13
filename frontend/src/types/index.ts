export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  userType: 'PUBLIC' | 'BUSINESS';
  companyId: string | null;
  phone?: string;
  avatarUrl?: string;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  TENANT_ADMIN = 'TENANT_ADMIN',
  TECHNICIAN = 'TECHNICIAN',
  CLIENT = 'CLIENT',
  READ_ONLY = 'READ_ONLY',
}

export interface Ticket {
  id: string;
  ticketNumber: string;
  title: string;
  description?: string;
  status: TicketStatus;
  priority: Priority;
  type: TicketType;
  companyId: string;
  createdBy: User;
  assignedTo?: User;
  asset?: Asset;
  sla?: SLA;
  resolution?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export enum TicketStatus {
  OPEN = 'OPEN',
  ASSIGNED = 'ASSIGNED',
  IN_PROGRESS = 'IN_PROGRESS',
  PENDING = 'PENDING',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
  ESCALATED = 'ESCALATED',
}

export enum Priority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum TicketType {
  INCIDENT = 'INCIDENT',
  REQUEST = 'REQUEST',
  PROBLEM = 'PROBLEM',
  CHANGE = 'CHANGE',
}

export interface Asset {
  id: string;
  name: string;
  assetType: AssetType;
  serialNumber?: string;
  manufacturer?: string;
  model?: string;
  location?: string;
  ipAddress?: string;
  status: string;
  companyId: string;
  createdAt: string;
}

export enum AssetType {
  COMPUTER = 'COMPUTER',
  SERVER = 'SERVER',
  PRINTER = 'PRINTER',
  SWITCH = 'SWITCH',
  IP_PHONE = 'IP_PHONE',
  CLOUD_INSTANCE = 'CLOUD_INSTANCE',
  NETWORK_DEVICE = 'NETWORK_DEVICE',
  VIRTUAL_MACHINE = 'VIRTUAL_MACHINE',
  OTHER = 'OTHER',
}

export interface Dispatch {
  id: string;
  ticketId: string;
  technicianId: string;
  companyId: string;
  status: DispatchStatus;
  scheduledAt?: string;
  arrivedAt?: string;
  completedAt?: string;
  notes?: string;
  customerSignature?: string;
  photoUrls: string[];
  latitude?: number;
  longitude?: number;
  ticket?: Ticket;
  technician?: User;
}

export enum DispatchStatus {
  PENDING = 'PENDING',
  DISPATCHED = 'DISPATCHED',
  EN_ROUTE = 'EN_ROUTE',
  ON_SITE = 'ON_SITE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export interface SLA {
  id: string;
  name: string;
  responseTimeMin: number;
  resolutionTimeMin: number;
  priority: Priority;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
