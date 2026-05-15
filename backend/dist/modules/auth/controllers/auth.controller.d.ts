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
        createdBy: {
            id: string;
            firstName: string;
            lastName: string;
            email: string;
        };
        assignedTo: {
            id: string;
            firstName: string;
            lastName: string;
            email: string;
        };
        resolvedBy: {
            id: string;
            firstName: string;
            lastName: string;
            email: string;
        };
        timeline: ({
            actor: {
                id: string;
                firstName: string;
                lastName: string;
            };
        } & import("@prisma/client/runtime").GetResult<{
            id: string;
            ticketId: string;
            action: string;
            actorId: string;
            oldValue: string | null;
            newValue: string | null;
            comment: string | null;
            isInternal: boolean;
            createdAt: Date;
        }, unknown> & {})[];
    } & import("@prisma/client/runtime").GetResult<{
        id: string;
        ticketNumber: string;
        title: string;
        description: string | null;
        contactName: string | null;
        contactEmail: string | null;
        contactPhone: string | null;
        category: string | null;
        subcategory: string | null;
        location: string | null;
        latitude: number | null;
        longitude: number | null;
        status: string;
        priority: string;
        type: string;
        companyId: string | null;
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
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    }, unknown> & {}>;
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
