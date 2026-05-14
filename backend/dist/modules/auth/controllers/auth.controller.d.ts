import { AuthService } from '../services/auth.service';
export declare class AuthController {
    private authService;
    constructor(authService: AuthService);
    login(body: {
        email: string;
        password: string;
    }): Promise<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
        user: {
            id: string;
            email: string;
            firstName: string;
            lastName: string;
            role: string;
            userType: string;
            companyId: string;
            emailVerified: boolean;
        };
    }>;
    register(body: {
        email: string;
        password: string;
        firstName: string;
        lastName: string;
    }): Promise<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
        user: {
            id: string;
            email: string;
            firstName: string;
            lastName: string;
            role: string;
            userType: string;
            companyId: any;
            emailVerified: boolean;
        };
    }>;
    registerBusiness(body: {
        email: string;
        password: string;
        firstName: string;
        lastName: string;
        inviteCode?: string;
        domain?: string;
    }): Promise<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
        user: {
            id: string;
            email: string;
            firstName: string;
            lastName: string;
            role: string;
            userType: string;
            companyId: string;
            emailVerified: boolean;
        };
    }>;
    forgotPassword(body: {
        email: string;
    }): Promise<{
        message: string;
    }>;
    resetPassword(body: {
        token: string;
        password: string;
    }): Promise<{
        message: string;
    }>;
    trackTicket(body: {
        email: string;
        ticketNumber: string;
    }): Promise<{
        assignedTo: {
            id: string;
            email: string;
            firstName: string;
            lastName: string;
        };
        createdBy: {
            id: string;
            email: string;
            firstName: string;
            lastName: string;
        };
        resolvedBy: {
            id: string;
            email: string;
            firstName: string;
            lastName: string;
        };
        timeline: ({
            actor: {
                id: string;
                firstName: string;
                lastName: string;
            };
        } & {
            createdAt: Date;
            id: string;
            ticketId: string;
            action: string;
            actorId: string;
            oldValue: string | null;
            newValue: string | null;
            comment: string | null;
            isInternal: boolean;
        })[];
    } & {
        createdAt: Date;
        id: string;
        description: string | null;
        companyId: string | null;
        updatedAt: Date;
        priority: string;
        deletedAt: Date | null;
        ticketNumber: string;
        title: string;
        contactName: string | null;
        contactEmail: string | null;
        contactPhone: string | null;
        category: string | null;
        subcategory: string | null;
        location: string | null;
        latitude: number | null;
        longitude: number | null;
        status: string;
        type: string;
        createdById: string;
        assignedToId: string | null;
        assetId: string | null;
        slaId: string | null;
        contractId: string | null;
        trackingToken: string | null;
        onHoldReason: string | null;
        resolution: string | null;
        resolvedAt: Date | null;
        resolvedById: string | null;
    }>;
    refresh(body: {
        refreshToken: string;
    }): Promise<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
    }>;
    logout(body: {
        refreshToken: string;
    }): Promise<void>;
    verifyEmail(token: string): Promise<{
        message: string;
    }>;
    resendVerification(body: {
        email: string;
    }): Promise<{
        message: string;
    }>;
}
