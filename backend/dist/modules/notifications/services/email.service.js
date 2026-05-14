"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailService = void 0;
const common_1 = require("@nestjs/common");
const nodemailer = require("nodemailer");
let EmailService = class EmailService {
    constructor() {
        const host = process.env.SMTP_HOST || 'localhost';
        const port = parseInt(process.env.SMTP_PORT || '1025', 10);
        const user = process.env.SMTP_USER || '';
        const pass = process.env.SMTP_PASS || '';
        if (host === 'localhost' && port === 1025) {
            this.transporter = nodemailer.createTransport({ host, port, ignoreTLS: true });
        }
        else if (user && pass) {
            this.transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
        }
        else if (host.includes('ethereal')) {
            nodemailer.createTestAccount().then((account) => {
                this.transporter = nodemailer.createTransport({
                    host: account.smtp.host,
                    port: account.smtp.port,
                    secure: account.smtp.secure,
                    auth: { user: account.user, pass: account.pass },
                });
            });
        }
    }
    async sendPasswordResetEmail(to, token) {
        const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
        const info = await this.transporter.sendMail({
            from: process.env.SMTP_FROM || 'noreply@fieldserviceit.com',
            to,
            subject: 'Password Reset - FieldserviceIT',
            html: `
        <h2>Password Reset</h2>
        <p>Click the link below to reset your password:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>This link expires in 1 hour.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `,
        });
        if (process.env.NODE_ENV !== 'production') {
            const previewUrl = nodemailer.getTestMessageUrl(info);
            if (previewUrl)
                console.log('Preview URL:', previewUrl);
        }
    }
    async sendNotificationEmail(to, subject, html) {
        await this.transporter.sendMail({
            from: process.env.SMTP_FROM || 'noreply@fieldserviceit.com',
            to,
            subject,
            html,
        });
    }
};
exports.EmailService = EmailService;
exports.EmailService = EmailService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], EmailService);
//# sourceMappingURL=email.service.js.map