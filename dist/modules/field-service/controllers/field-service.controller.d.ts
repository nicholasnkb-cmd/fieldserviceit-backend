import { FieldServiceService } from '../services/field-service.service';
export declare class FieldServiceController {
    private fieldService;
    constructor(fieldService: FieldServiceService);
    dispatch(body: {
        ticketId: string;
        technicianId: string;
    }, user: any): Promise<import("mysql2").RowDataPacket>;
    getBoard(user: any): Promise<import("mysql2").RowDataPacket[]>;
    updateStatus(id: string, status: string, user: any): Promise<import("mysql2").RowDataPacket>;
    addNotes(id: string, notes: string, user: any): Promise<import("mysql2").RowDataPacket>;
    addSignature(id: string, signature: string, user: any): Promise<import("mysql2").RowDataPacket>;
    addPhotos(id: string, photoUrls: string[], user: any): Promise<import("mysql2").RowDataPacket>;
}
