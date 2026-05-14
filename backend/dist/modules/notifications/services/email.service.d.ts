export declare class EmailService {
    private transporter;
    constructor();
    sendPasswordResetEmail(to: string, token: string): Promise<void>;
    sendNotificationEmail(to: string, subject: string, html: string): Promise<void>;
}
