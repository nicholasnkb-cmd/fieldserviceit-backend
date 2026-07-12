import { Injectable, UnauthorizedException, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { createReadStream } from 'fs';
import { copyFile, mkdir, readFile, readdir, rename, stat, writeFile } from 'fs/promises';
import { join, resolve } from 'path';

type EducationProfile = {
  id: string;
  label: string;
  role: string;
  landing: string;
  permissions: string[];
};

type EducationAccount = {
  profileId: string;
  passwordHash: string;
  active: boolean;
  mustChangePassword: boolean;
  updatedAt: string;
};

const defaultUsers: EducationProfile[] = [
  { id: 'district-admin', label: 'District Admin', role: 'Admin', landing: 'platform', permissions: ['manage-tenants', 'approve-posts', 'emergency', 'lms', 'teacher-tools', 'message', 'manage-users', 'view-compliance'] },
  { id: 'teacher', label: 'Prof. Miller', role: 'Teacher', landing: 'teacher', permissions: ['lms', 'teacher-tools', 'message', 'submit-post'] },
  { id: 'parent', label: 'Sarah Jenkins', role: 'Parent', landing: 'parent', permissions: ['message', 'submit-post'] },
  { id: 'student', label: 'Hero', role: 'Student', landing: 'student', permissions: ['student-missions'] },
];

const defaultPasswords: Record<string, string> = {
  'district-admin': 'admin123',
  teacher: 'teacher123',
  parent: 'parent123',
  student: 'student123',
};

@Injectable()
export class EducationService {
  private readonly dataDir = resolve(process.env.EDUCONNECT_DATA_DIR || process.env.DATA_DIR || 'data/educonnect');
  private readonly stateFile = join(this.dataDir, 'educonnect-state.json');
  private readonly accountsFile = join(this.dataDir, 'educonnect-accounts.json');
  private readonly uploadDir = join(this.dataDir, 'uploads');
  private readonly backupDir = join(this.dataDir, 'backups');
  private readonly sessions = new Map<string, { user: EducationProfile; createdAt: number }>();

  health() {
    return { ok: true, service: 'educonnect-education-api', mode: 'operational', time: new Date().toISOString() };
  }

  async getState() {
    return { ok: true, snapshot: await this.loadSnapshot() };
  }

  async saveState(snapshot: any) {
    await this.saveSnapshot(snapshot);
    return { ok: true, savedAt: new Date().toISOString() };
  }

  async resetState() {
    const snapshot = this.initialSnapshot();
    await this.saveSnapshot(snapshot);
    return { ok: true, snapshot };
  }

  async login(profileId: string, password: string) {
    const snapshot = await this.loadSnapshot();
    const account = (await this.loadAccounts()).find((item) => item.profileId === profileId);
    const user = snapshot.userProfiles.find((profile) => profile.id === profileId);
    if (!account || !user || account.active === false || account.passwordHash !== this.hashPassword(password || '')) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const token = randomUUID();
    this.sessions.set(token, { user, createdAt: Date.now() });
    return { ok: true, token, user };
  }

  getSession(token: string) {
    const session = this.sessionFor(token);
    return { ok: true, user: session.user };
  }

  async listUsers(token: string) {
    this.requireAdmin(token);
    const snapshot = await this.loadSnapshot();
    const accounts = await this.loadAccounts();
    return { ok: true, users: snapshot.userProfiles.map((profile) => this.publicUser(profile, accounts.find((account) => account.profileId === profile.id))) };
  }

  async createUser(token: string, body: any) {
    this.requireAdmin(token);
    const snapshot = await this.loadSnapshot();
    const id = String(body.id || `${String(body.role || 'user').toLowerCase()}-${Date.now()}`).replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
    if (snapshot.userProfiles.some((profile) => profile.id === id)) throw new BadRequestException('User already exists');
    const role = body.role || 'Student';
    const profile: EducationProfile = {
      id,
      label: body.label || 'New User',
      role,
      landing: body.landing || (role === 'Admin' ? 'platform' : role.toLowerCase()),
      permissions: Array.isArray(body.permissions) ? body.permissions : this.permissionsForRole(role),
    };
    snapshot.userProfiles.push(profile);
    await this.saveSnapshot(snapshot);
    const accounts = await this.loadAccounts();
    const account = { profileId: id, passwordHash: this.hashPassword(body.password || 'changeme123'), active: true, mustChangePassword: true, updatedAt: new Date().toISOString() };
    accounts.push(account);
    await this.saveAccounts(accounts);
    return { ok: true, user: this.publicUser(profile, account), temporaryPassword: body.password ? undefined : 'changeme123' };
  }

  async updateUser(token: string, profileId: string, body: any) {
    this.requireAdmin(token);
    const accounts = await this.loadAccounts();
    const account = accounts.find((item) => item.profileId === profileId);
    if (!account) throw new NotFoundException('User account not found');
    if (typeof body.active === 'boolean') account.active = body.active;
    if (body.password) {
      account.passwordHash = this.hashPassword(body.password);
      account.mustChangePassword = Boolean(body.mustChangePassword);
    }
    account.updatedAt = new Date().toISOString();
    await this.saveAccounts(accounts);
    return { ok: true, account: { profileId: account.profileId, active: account.active, mustChangePassword: account.mustChangePassword } };
  }

  async changePassword(token: string, body: any) {
    const session = this.sessionFor(token);
    const accounts = await this.loadAccounts();
    const account = accounts.find((item) => item.profileId === session.user.id);
    if (!account || account.passwordHash !== this.hashPassword(body.currentPassword || '')) throw new UnauthorizedException('Current password is incorrect');
    if (!body.newPassword || String(body.newPassword).length < 8) throw new BadRequestException('New password must be at least 8 characters');
    account.passwordHash = this.hashPassword(body.newPassword);
    account.mustChangePassword = false;
    account.updatedAt = new Date().toISOString();
    await this.saveAccounts(accounts);
    return { ok: true };
  }

  async resetPassword(token: string, body: any) {
    this.requireAdmin(token);
    const accounts = await this.loadAccounts();
    const account = accounts.find((item) => item.profileId === body.profileId);
    if (!account) throw new NotFoundException('User account not found');
    const password = body.newPassword || `Reset${Math.floor(100000 + Math.random() * 900000)}`;
    account.passwordHash = this.hashPassword(password);
    account.mustChangePassword = true;
    account.updatedAt = new Date().toISOString();
    await this.saveAccounts(accounts);
    return { ok: true, temporaryPassword: password };
  }

  async uploadFile(body: any) {
    const snapshot = await this.loadSnapshot();
    const id = `upload-${Date.now()}-${randomUUID().slice(0, 8)}`;
    let storedPath = '';
    if (body.contentBase64) {
      await mkdir(this.uploadDir, { recursive: true });
      const safeName = String(body.name || 'upload.bin').replace(/[^a-z0-9._-]+/gi, '-');
      storedPath = join(this.uploadDir, `${id}-${safeName}`);
      await writeFile(storedPath, Buffer.from(body.contentBase64, 'base64'));
    }
    const file = {
      id,
      name: body.name || 'Uploaded file',
      area: body.area || 'LMS',
      size: body.size || 'Unknown',
      status: storedPath ? 'Stored on server' : 'Metadata stored on server',
      type: body.type || 'application/octet-stream',
      storedPath: storedPath ? storedPath.replace(this.dataDir, 'data') : '',
    };
    snapshot.fileUploads = [file, ...(snapshot.fileUploads || [])];
    await this.saveSnapshot(snapshot);
    return { ok: true, file };
  }

  async listFiles() {
    const snapshot = await this.loadSnapshot();
    return { ok: true, files: snapshot.fileUploads || [] };
  }

  async fileForDownload(fileId: string) {
    const snapshot = await this.loadSnapshot();
    const file = (snapshot.fileUploads || []).find((item) => item.id === fileId);
    if (!file?.storedPath) throw new NotFoundException('Stored file not found');
    const filePath = resolve(file.storedPath.replace(/^data/, this.dataDir));
    if (!filePath.startsWith(this.dataDir)) throw new ForbiddenException('Invalid file path');
    return { file, stream: createReadStream(filePath) };
  }

  async sendNotificationTest(body: any) {
    const snapshot = await this.loadSnapshot();
    const records = (body.channels || ['Email', 'SMS', 'Push']).map((channel) => ({
      id: `delivery-${Date.now()}-${channel}`,
      channel,
      audience: body.audience || 'Launch test group',
      status: 'Delivered',
      detail: `${channel} test generated by operational API`,
    }));
    snapshot.notificationDeliveryLog = [...records, ...(snapshot.notificationDeliveryLog || [])];
    snapshot.lmsNotifications = [{ id: `notice-${Date.now()}`, level: 'FYI', title: 'Notification delivery test completed', target: body.audience || 'Launch Control', channel: 'Operational API', read: false }, ...(snapshot.lmsNotifications || [])];
    await this.saveSnapshot(snapshot);
    return { ok: true, records };
  }

  async listBackups() {
    await mkdir(this.backupDir, { recursive: true });
    return { ok: true, backups: (await readdir(this.backupDir)).filter((file) => file.endsWith('.json')).sort().reverse() };
  }

  async createBackup(token: string) {
    this.requireAdmin(token);
    await this.ensureDataFile();
    await mkdir(this.backupDir, { recursive: true });
    const backup = `educonnect-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    await copyFile(this.stateFile, join(this.backupDir, backup));
    return { ok: true, backup };
  }

  private initialSnapshot() {
    return {
      state: { role: 'platform', currentUser: 'district-admin', apiMode: 'live-api', selectedSchool: 'ps-118' },
      userProfiles: defaultUsers,
      fileUploads: [],
      notificationDeliveryLog: [],
      lmsNotifications: [],
      auditLogs: [],
    };
  }

  private hashPassword(password: string) {
    return createHash('sha256').update(`educonnect:${password}`).digest('hex');
  }

  private permissionsForRole(role: string) {
    if (role === 'Admin') return ['manage-tenants', 'approve-posts', 'emergency', 'lms', 'teacher-tools', 'message', 'manage-users', 'view-compliance'];
    if (role === 'Teacher') return ['lms', 'teacher-tools', 'message', 'submit-post'];
    if (role === 'Parent') return ['message', 'submit-post'];
    return ['student-missions'];
  }

  private publicUser(profile: EducationProfile, account?: EducationAccount) {
    return { ...profile, active: account?.active !== false, mustChangePassword: Boolean(account?.mustChangePassword) };
  }

  private tokenFromHeader(header = '') {
    return header.replace(/^Bearer\\s+/i, '');
  }

  private sessionFor(headerOrToken = '') {
    const token = this.tokenFromHeader(headerOrToken);
    const session = this.sessions.get(token);
    if (!session) throw new UnauthorizedException('Authentication required');
    return session;
  }

  private requireAdmin(headerOrToken = '') {
    const session = this.sessionFor(headerOrToken);
    if (!session.user.permissions.includes('manage-users')) throw new ForbiddenException('Admin permission required');
    return session;
  }

  private async ensureDataFile() {
    await mkdir(this.dataDir, { recursive: true });
    try {
      await stat(this.stateFile);
    } catch {
      await this.saveSnapshot(this.initialSnapshot());
    }
    await this.ensureAccountsFile();
  }

  private async loadSnapshot() {
    await this.ensureDataFile();
    return JSON.parse(await readFile(this.stateFile, 'utf8'));
  }

  private async saveSnapshot(snapshot: any) {
    if (!snapshot?.state || !Array.isArray(snapshot.userProfiles)) throw new BadRequestException('Invalid snapshot');
    await mkdir(this.dataDir, { recursive: true });
    const tempFile = `${this.stateFile}.${Date.now()}.tmp`;
    await writeFile(tempFile, JSON.stringify({ ...snapshot, state: { ...snapshot.state, apiMode: 'live-api' } }, null, 2));
    await rename(tempFile, this.stateFile);
  }

  private async ensureAccountsFile() {
    await mkdir(this.dataDir, { recursive: true });
    try {
      await stat(this.accountsFile);
    } catch {
      await this.saveAccounts(defaultUsers.map((profile) => ({
        profileId: profile.id,
        passwordHash: this.hashPassword(defaultPasswords[profile.id] || `${profile.id}123`),
        active: true,
        mustChangePassword: false,
        updatedAt: new Date().toISOString(),
      })));
    }
  }

  private async loadAccounts() {
    await this.ensureAccountsFile();
    return JSON.parse(await readFile(this.accountsFile, 'utf8')) as EducationAccount[];
  }

  private async saveAccounts(accounts: EducationAccount[]) {
    await mkdir(this.dataDir, { recursive: true });
    const tempFile = `${this.accountsFile}.${Date.now()}.tmp`;
    await writeFile(tempFile, JSON.stringify(accounts, null, 2));
    await rename(tempFile, this.accountsFile);
  }
}
