declare enum Priority {
    LOW = "LOW",
    MEDIUM = "MEDIUM",
    HIGH = "HIGH",
    CRITICAL = "CRITICAL"
}
declare enum TicketType {
    INCIDENT = "INCIDENT",
    REQUEST = "REQUEST",
    PROBLEM = "PROBLEM",
    CHANGE = "CHANGE"
}
export declare class CreateTicketDto {
    title: string;
    description?: string;
    contactName: string;
    contactEmail: string;
    contactPhone: string;
    category?: string;
    subcategory?: string;
    location?: string;
    latitude?: number;
    longitude?: number;
    priority?: Priority;
    type?: TicketType;
    assetId?: string;
    slaId?: string;
}
export {};
