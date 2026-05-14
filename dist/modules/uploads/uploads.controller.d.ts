import { UploadsService } from './uploads.service';
export declare class UploadsController {
    private uploadsService;
    constructor(uploadsService: UploadsService);
    uploadPhotos(files: Express.Multer.File[], user: any): Promise<string[]>;
    uploadSignature(file: Express.Multer.File, user: any): Promise<string>;
    uploadAvatar(file: Express.Multer.File): Promise<string>;
    uploadTicketFiles(files: Express.Multer.File[], user: any): Promise<string[]>;
}
