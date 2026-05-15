import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { createPool, Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';

interface QueryOptions {
  nestTables?: boolean;
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: Pool;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL || '';
    const parsed = this.parseDatabaseUrl(databaseUrl);

    this.pool = createPool({
      host: parsed.host,
      port: parsed.port,
      user: parsed.user,
      password: parsed.password,
      database: parsed.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      acquireTimeout: 10000,
      timeout: 10000,
    });
  }

  async onModuleInit() {
    try {
      const conn = await this.pool.getConnection();
      conn.release();
      this.logger.log('Database connected');
    } catch (err) {
      this.logger.warn('Database unavailable: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  private parseDatabaseUrl(url: string) {
    const match = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):?(\d+)?\/(.+)/);
    if (!match) throw new Error(`Invalid DATABASE_URL: ${url}`);
    return {
      user: decodeURIComponent(match[1]),
      password: decodeURIComponent(match[2]),
      host: match[3],
      port: parseInt(match[4] || '3306', 10),
      database: match[5].split('?')[0],
    };
  }

  async query<T = RowDataPacket[]>(sql: string, values?: any[]): Promise<T> {
    const [rows] = await this.pool.execute(sql, values || []);
    return rows as T;
  }

  async execute(sql: string, values?: any[]): Promise<ResultSetHeader> {
    const [result] = await this.pool.execute(sql, values || []);
    return result as ResultSetHeader;
  }

  async transaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
    const conn = await this.pool.getConnection();
    await conn.beginTransaction();
    try {
      const tx = new TransactionClient(conn);
      const result = await fn(tx);
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  user = {
    findUnique: async ({ where, select }: { where: Record<string, any>; select?: Record<string, boolean> }) => {
      const cols = select ? Object.keys(select).filter(k => select[k]) : ['*'];
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = Object.values(where);
      const rows = await this.query<RowDataPacket[]>(
        `SELECT ${cols.join(', ')} FROM User WHERE ${whereClauses.join(' AND ')} LIMIT 1`,
        values,
      );
      return rows[0] || null;
    },

    findFirst: async ({ where, select, include }: { where: Record<string, any>; select?: Record<string, boolean>; include?: Record<string, any> }) => {
      const cols = select ? Object.keys(select).filter(k => select[k]) : ['*'];
      const whereClauses = Object.entries(where).map(([k, v]) => {
        if (v === null) return `${this.escapeColumn(k)} IS NULL`;
        return `${this.escapeColumn(k)} = ?`;
      }).filter(Boolean);
      const values = Object.values(where).filter(v => v !== null);
      const rows = await this.query<RowDataPacket[]>(
        `SELECT ${cols.join(', ')} FROM User WHERE ${whereClauses.join(' AND ')} LIMIT 1`,
        values,
      );
      return rows[0] || null;
    },

    findMany: async ({ where, select, orderBy, skip, take, include }: { where?: Record<string, any>; select?: Record<string, boolean>; orderBy?: Record<string, 'asc' | 'desc'>; skip?: number; take?: number; include?: Record<string, any> }) => {
      const cols = select ? Object.keys(select).filter(k => select[k]) : ['*'];
      let sql = `SELECT ${cols.join(', ')} FROM User`;
      const values: any[] = [];

      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          if (typeof v === 'object' && v !== null) {
            if (v.contains !== undefined) { values.push(`%${v.contains}%`); return `${this.escapeColumn(k)} LIKE ?`; }
            if (v.gte !== undefined) { values.push(v.gte); return `${this.escapeColumn(k)} >= ?`; }
            if (v.lte !== undefined) { values.push(v.lte); return `${this.escapeColumn(k)} <= ?`; }
            if (v.in !== undefined) { values.push(v.in); return `${this.escapeColumn(k)} IN (?)`; }
          }
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }

      if (orderBy) {
        const orderParts = Object.entries(orderBy).map(([k, v]) => `${this.escapeColumn(k)} ${v.toUpperCase()}`);
        sql += ` ORDER BY ${orderParts.join(', ')}`;
      }

      if (take !== undefined) {
        sql += ` LIMIT ?`;
        values.push(take);
      }
      if (skip !== undefined) {
        sql += ` OFFSET ?`;
        values.push(skip);
      }

      const rows = await this.query<RowDataPacket[]>(sql, values);
      return rows;
    },

    count: async ({ where }: { where?: Record<string, any> }) => {
      let sql = 'SELECT COUNT(*) as count FROM User';
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      const rows = await this.query<RowDataPacket[]>(sql, values);
      return Number(rows[0].count);
    },

    create: async ({ data, select }: { data: Record<string, any>; select?: Record<string, boolean> }) => {
      const now = new Date();
      const insertData = { id: this.generateUuid(), createdAt: now, updatedAt: now, ...data };
      const cols = Object.keys(insertData);
      const values = Object.values(insertData);
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT INTO User (${cols.map(c => this.escapeColumn(c)).join(', ')}) VALUES (${placeholders})`;
      await this.execute(sql, values);
      const selCols = select ? Object.keys(select).filter(k => select[k]) : ['*'];
      const rows = await this.query<RowDataPacket[]>(`SELECT ${selCols.join(', ')} FROM User WHERE id = ? LIMIT 1`, [insertData.id]);
      return rows[0];
    },

    update: async ({ where, data, select }: { where: Record<string, any>; data: Record<string, any>; select?: Record<string, boolean> }) => {
      const cols = select ? Object.keys(select).filter(k => select[k]) : ['*'];
      const setClauses = Object.keys(data).map(k => `${this.escapeColumn(k)} = ?`);
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = [...Object.values(data), ...Object.values(where)];
      const sql = `UPDATE User SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`;
      await this.execute(sql, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT ${cols.join(', ')} FROM User WHERE ${whereClauses.join(' AND ')} LIMIT 1`, Object.values(where));
      return rows[0];
    },

    updateMany: async ({ where, data }: { where: Record<string, any>; data: Record<string, any> }) => {
      const setClauses = Object.keys(data).map(k => `${this.escapeColumn(k)} = ?`);
      const whereClauses = Object.entries(where).map(([k, v]) => {
        if (v === null) return `${this.escapeColumn(k)} IS NULL`;
        return `${this.escapeColumn(k)} = ?`;
      });
      const values = [...Object.values(data), ...Object.values(where).filter(v => v !== null)];
      const sql = `UPDATE User SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`;
      const result = await this.execute(sql, values);
      return { count: result.affectedRows };
    },

    deleteMany: async ({ where }: { where: Record<string, any> }) => {
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = Object.values(where);
      const sql = `DELETE FROM User WHERE ${whereClauses.join(' AND ')}`;
      const result = await this.execute(sql, values);
      return { count: result.affectedRows };
    },
  };

  company = {
    findUnique: async ({ where, select }: { where: Record<string, any>; select?: Record<string, boolean> }) => {
      const cols = select ? Object.keys(select).filter(k => select[k]) : ['*'];
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = Object.values(where);
      const rows = await this.query<RowDataPacket[]>(
        `SELECT ${cols.join(', ')} FROM Company WHERE ${whereClauses.join(' AND ')} LIMIT 1`,
        values,
      );
      return rows[0] || null;
    },

    findFirst: async ({ where, select }: { where: Record<string, any>; select?: Record<string, boolean> }) => {
      const cols = select ? Object.keys(select).filter(k => select[k]) : ['*'];
      const whereClauses = Object.entries(where).map(([k, v]) => {
        if (v === null) return `${this.escapeColumn(k)} IS NULL`;
        return `${this.escapeColumn(k)} = ?`;
      }).filter(Boolean);
      const values = Object.values(where).filter(v => v !== null);
      const rows = await this.query<RowDataPacket[]>(
        `SELECT ${cols.join(', ')} FROM Company WHERE ${whereClauses.join(' AND ')} LIMIT 1`,
        values,
      );
      return rows[0] || null;
    },

    findMany: async ({ where, select, orderBy, skip, take }: { where?: Record<string, any>; select?: Record<string, boolean>; orderBy?: Record<string, 'asc' | 'desc'>; skip?: number; take?: number }) => {
      const cols = select ? Object.keys(select).filter(k => select[k]) : ['*'];
      let sql = `SELECT ${cols.join(', ')} FROM Company`;
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      if (orderBy) {
        const orderParts = Object.entries(orderBy).map(([k, v]) => `${this.escapeColumn(k)} ${v.toUpperCase()}`);
        sql += ` ORDER BY ${orderParts.join(', ')}`;
      }
      if (take !== undefined) { sql += ` LIMIT ?`; values.push(take); }
      if (skip !== undefined) { sql += ` OFFSET ?`; values.push(skip); }
      const rows = await this.query<RowDataPacket[]>(sql, values);
      return rows;
    },

    create: async ({ data }: { data: Record<string, any> }) => {
      const now = new Date();
      const insertData = { id: this.generateUuid(), createdAt: now, updatedAt: now, ...data };
      const cols = Object.keys(insertData);
      const values = Object.values(insertData);
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT INTO Company (${cols.map(c => this.escapeColumn(c)).join(', ')}) VALUES (${placeholders})`;
      await this.execute(sql, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM Company WHERE id = ? LIMIT 1`, [insertData.id]);
      return rows[0];
    },

    update: async ({ where, data, select }: { where: Record<string, any>; data: Record<string, any>; select?: Record<string, boolean> }) => {
      const cols = select ? Object.keys(select).filter(k => select[k]) : ['*'];
      const setClauses = Object.keys(data).map(k => `${this.escapeColumn(k)} = ?`);
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = [...Object.values(data), ...Object.values(where)];
      const sql = `UPDATE Company SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`;
      await this.execute(sql, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT ${cols.join(', ')} FROM Company WHERE id = ? LIMIT 1`, [where.id]);
      return rows[0];
    },
  };

  ticket = {
    findUnique: async ({ where, select, include }: { where: Record<string, any>; select?: Record<string, boolean>; include?: Record<string, any> }) => {
      const cols = select ? Object.keys(select).filter(k => select[k]) : ['*'];
      const whereClauses = Object.entries(where).map(([k, v]) => {
        if (v === null) return `${this.escapeColumn(k)} IS NULL`;
        return `${this.escapeColumn(k)} = ?`;
      });
      const values = Object.values(where).filter(v => v !== null);
      const rows = await this.query<RowDataPacket[]>(
        `SELECT ${cols.join(', ')} FROM Ticket WHERE ${whereClauses.join(' AND ')} LIMIT 1`,
        values,
      );
      return this.enrichTicket(rows[0], include) || null;
    },

    findFirst: async ({ where, select, include }: { where: Record<string, any>; select?: Record<string, boolean>; include?: Record<string, any> }) => {
      const cols = select ? Object.keys(select).filter(k => select[k]) : ['*'];
      const whereClauses = Object.entries(where).map(([k, v]) => {
        if (v === null) return `${this.escapeColumn(k)} IS NULL`;
        return `${this.escapeColumn(k)} = ?`;
      }).filter(Boolean);
      const values = Object.values(where).filter(v => v !== null);
      const rows = await this.query<RowDataPacket[]>(
        `SELECT ${cols.join(', ')} FROM Ticket WHERE ${whereClauses.join(' AND ')} LIMIT 1`,
        values,
      );
      return this.enrichTicket(rows[0], include) || null;
    },

    findMany: async ({ where, select, orderBy, skip, take, include }: { where?: Record<string, any>; select?: Record<string, boolean>; orderBy?: Record<string, 'asc' | 'desc'>; skip?: number; take?: number; include?: Record<string, any> }) => {
      const cols = select ? Object.keys(select).filter(k => select[k] && typeof select[k] === 'boolean') : ['*'];
      let sql = `SELECT ${cols.join(', ')} FROM Ticket`;
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          if (typeof v === 'object' && v !== null) {
            if (v.contains !== undefined) { values.push(`%${v.contains}%`); return `${this.escapeColumn(k)} LIKE ?`; }
            if (v.gte !== undefined) { values.push(v.gte); return `${this.escapeColumn(k)} >= ?`; }
          }
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      if (orderBy) {
        const orderParts = Object.entries(orderBy).map(([k, v]) => `${this.escapeColumn(k)} ${v.toUpperCase()}`);
        sql += ` ORDER BY ${orderParts.join(', ')}`;
      }
      if (take !== undefined) { sql += ` LIMIT ?`; values.push(take); }
      if (skip !== undefined) { sql += ` OFFSET ?`; values.push(skip); }
      const rows = await this.query<RowDataPacket[]>(sql, values);
      return Promise.all(rows.map(r => this.enrichTicket(r, include)));
    },

    count: async ({ where }: { where?: Record<string, any> }) => {
      let sql = 'SELECT COUNT(*) as count FROM Ticket';
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      const rows = await this.query<RowDataPacket[]>(sql, values);
      return Number(rows[0].count);
    },

    create: async ({ data, select, include }: { data: Record<string, any>; select?: Record<string, boolean>; include?: Record<string, any> }) => {
      const now = new Date();
      const insertData = { id: this.generateUuid(), createdAt: now, updatedAt: now, ...data };
      const cols = Object.keys(insertData).filter(k => insertData[k] !== undefined);
      const values = cols.map(k => insertData[k]);
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT INTO Ticket (${cols.map(c => this.escapeColumn(c)).join(', ')}) VALUES (${placeholders})`;
      await this.execute(sql, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM Ticket WHERE id = ? LIMIT 1`, [insertData.id]);
      return this.enrichTicket(rows[0], include);
    },

    update: async ({ where, data, select, include }: { where: Record<string, any>; data: Record<string, any>; select?: Record<string, boolean>; include?: Record<string, any> }) => {
      const setClauses = Object.keys(data).map(k => `${this.escapeColumn(k)} = ?`);
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = [...Object.values(data), ...Object.values(where)];
      const sql = `UPDATE Ticket SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`;
      await this.execute(sql, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM Ticket WHERE ${whereClauses.join(' AND ')} LIMIT 1`, Object.values(where));
      return this.enrichTicket(rows[0], include);
    },

    delete: async ({ where }: { where: Record<string, any> }) => {
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = Object.values(where);
      const sql = `DELETE FROM Ticket WHERE ${whereClauses.join(' AND ')}`;
      const result = await this.execute(sql, values);
      return { count: result.affectedRows };
    },
  };

  session = {
    findUnique: async ({ where, include }: { where: Record<string, any>; include?: Record<string, any> }) => {
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = Object.values(where);
      const rows = await this.query<RowDataPacket[]>(
        `SELECT * FROM Session WHERE ${whereClauses.join(' AND ')} LIMIT 1`,
        values,
      );
      const session = rows[0] || null;
      if (session && include?.user) {
        const userRows = await this.query<RowDataPacket[]>(`SELECT * FROM User WHERE id = ? LIMIT 1`, [session.userId]);
        session.user = userRows[0] || null;
      }
      return session;
    },

    create: async ({ data }: { data: Record<string, any> }) => {
      const insertData = { id: this.generateUuid(), createdAt: new Date(), ...data };
      const cols = Object.keys(insertData);
      const values = Object.values(insertData);
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT INTO Session (${cols.map(c => this.escapeColumn(c)).join(', ')}) VALUES (${placeholders})`;
      await this.execute(sql, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM Session WHERE id = ? LIMIT 1`, [insertData.id]);
      return rows[0];
    },

    update: async ({ where, data }: { where: Record<string, any>; data: Record<string, any> }) => {
      const setClauses = Object.keys(data).map(k => `${this.escapeColumn(k)} = ?`);
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = [...Object.values(data), ...Object.values(where)];
      const sql = `UPDATE Session SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`;
      await this.execute(sql, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM Session WHERE refreshToken = ? LIMIT 1`, [where.refreshToken]);
      return rows[0];
    },

    deleteMany: async ({ where }: { where: Record<string, any> }) => {
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = Object.values(where);
      const sql = `DELETE FROM Session WHERE ${whereClauses.join(' AND ')}`;
      const result = await this.execute(sql, values);
      return { count: result.affectedRows };
    },
  };

  ticketAttachment = {
    create: async ({ data, include }: { data: Record<string, any>; include?: Record<string, any> }) => {
      const insertData = { id: this.generateUuid(), createdAt: new Date(), ...data };
      const cols = Object.keys(insertData);
      const values = Object.values(insertData);
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT INTO TicketAttachment (${cols.map(c => this.escapeColumn(c)).join(', ')}) VALUES (${placeholders})`;
      await this.execute(sql, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM TicketAttachment WHERE id = ? LIMIT 1`, [insertData.id]);
      const attachment = rows[0];
      if (attachment && include?.uploadedBy) {
        const userRows = await this.query<RowDataPacket[]>(`SELECT id, firstName, lastName FROM User WHERE id = ? LIMIT 1`, [attachment.uploadedById]);
        attachment.uploadedBy = userRows[0] || null;
      }
      return attachment;
    },

    delete: async ({ where }: { where: Record<string, any> }) => {
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = Object.values(where);
      const sql = `DELETE FROM TicketAttachment WHERE ${whereClauses.join(' AND ')}`;
      await this.execute(sql, values);
      return { success: true };
    },
  };

  ticketTemplate = {
    findMany: async ({ where, orderBy }: { where?: Record<string, any>; orderBy?: Record<string, 'asc' | 'desc'> }) => {
      let sql = 'SELECT * FROM TicketTemplate';
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      if (orderBy) {
        const orderParts = Object.entries(orderBy).map(([k, v]) => `${this.escapeColumn(k)} ${v.toUpperCase()}`);
        sql += ` ORDER BY ${orderParts.join(', ')}`;
      }
      return this.query<RowDataPacket[]>(sql, values);
    },

    create: async ({ data }: { data: Record<string, any> }) => {
      const now = new Date();
      const insertData = { id: this.generateUuid(), createdAt: now, updatedAt: now, ...data };
      const cols = Object.keys(insertData);
      const values = Object.values(insertData);
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT INTO TicketTemplate (${cols.map(c => this.escapeColumn(c)).join(', ')}) VALUES (${placeholders})`;
      await this.execute(sql, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM TicketTemplate WHERE id = ? LIMIT 1`, [insertData.id]);
      return rows[0];
    },

    update: async ({ where, data }: { where: Record<string, any>; data: Record<string, any> }) => {
      const setClauses = Object.keys(data).map(k => `${this.escapeColumn(k)} = ?`);
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = [...Object.values(data), ...Object.values(where)];
      const sql = `UPDATE TicketTemplate SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`;
      await this.execute(sql, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM TicketTemplate WHERE id = ? LIMIT 1`, [where.id]);
      return rows[0];
    },
  };

  timeEntry = {
    create: async ({ data }: { data: Record<string, any> }) => {
      const insertData = { id: this.generateUuid(), createdAt: new Date(), ...data };
      const cols = Object.keys(insertData);
      const values = Object.values(insertData);
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT INTO TimeEntry (${cols.map(c => this.escapeColumn(c)).join(', ')}) VALUES (${placeholders})`;
      await this.execute(sql, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM TimeEntry WHERE id = ? LIMIT 1`, [insertData.id]);
      return rows[0];
    },

    findMany: async ({ where, orderBy, include }: { where?: Record<string, any>; orderBy?: Record<string, 'asc' | 'desc'>; include?: Record<string, any> }) => {
      let sql = 'SELECT * FROM TimeEntry';
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      if (orderBy) {
        const orderParts = Object.entries(orderBy).map(([k, v]) => `${this.escapeColumn(k)} ${v.toUpperCase()}`);
        sql += ` ORDER BY ${orderParts.join(', ')}`;
      }
      const rows = await this.query<RowDataPacket[]>(sql, values);
      if (include?.user) {
        for (const row of rows) {
          const userRows = await this.query<RowDataPacket[]>(`SELECT id, firstName, lastName FROM User WHERE id = ? LIMIT 1`, [row.userId]);
          row.user = userRows[0] || null;
        }
      }
      return rows;
    },
  };

  dispatch = {
    findMany: async ({ where, select, orderBy, skip, take }: { where?: Record<string, any>; select?: Record<string, boolean>; orderBy?: Record<string, 'asc' | 'desc'>; skip?: number; take?: number }) => {
      const cols = select ? Object.keys(select).filter(k => select[k]) : ['*'];
      let sql = `SELECT ${cols.join(', ')} FROM Dispatch`;
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      if (orderBy) {
        const orderParts = Object.entries(orderBy).map(([k, v]) => `${this.escapeColumn(k)} ${v.toUpperCase()}`);
        sql += ` ORDER BY ${orderParts.join(', ')}`;
      }
      if (take !== undefined) { sql += ` LIMIT ?`; values.push(take); }
      if (skip !== undefined) { sql += ` OFFSET ?`; values.push(skip); }
      return this.query<RowDataPacket[]>(sql, values);
    },
  };

  asset = {
    findMany: async ({ where, select, orderBy, skip, take }: { where?: Record<string, any>; select?: Record<string, boolean>; orderBy?: Record<string, 'asc' | 'desc'>; skip?: number; take?: number }) => {
      const cols = select ? Object.keys(select).filter(k => select[k]) : ['*'];
      let sql = `SELECT ${cols.join(', ')} FROM Asset`;
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          if (typeof v === 'object' && v?.contains !== undefined) { values.push(`%${v.contains}%`); return `${this.escapeColumn(k)} LIKE ?`; }
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      if (orderBy) {
        const orderParts = Object.entries(orderBy).map(([k, v]) => `${this.escapeColumn(k)} ${v.toUpperCase()}`);
        sql += ` ORDER BY ${orderParts.join(', ')}`;
      }
      if (take !== undefined) { sql += ` LIMIT ?`; values.push(take); }
      if (skip !== undefined) { sql += ` OFFSET ?`; values.push(skip); }
      return this.query<RowDataPacket[]>(sql, values);
    },

    findFirst: async ({ where, select }: { where: Record<string, any>; select?: Record<string, boolean> }) => {
      const cols = select ? Object.keys(select).filter(k => select[k]) : ['*'];
      const whereClauses = Object.entries(where).map(([k, v]) => {
        if (v === null) return `${this.escapeColumn(k)} IS NULL`;
        return `${this.escapeColumn(k)} = ?`;
      }).filter(Boolean);
      const values = Object.values(where).filter(v => v !== null);
      const rows = await this.query<RowDataPacket[]>(
        `SELECT ${cols.join(', ')} FROM Asset WHERE ${whereClauses.join(' AND ')} LIMIT 1`,
        values,
      );
      return rows[0] || null;
    },

    findUnique: async ({ where, select, orderBy }: { where: Record<string, any>; select?: Record<string, boolean>; orderBy?: Record<string, 'asc' | 'desc'> }) => {
      const cols = select ? Object.keys(select).filter(k => select[k]) : ['*'];
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = Object.values(where);
      let sql = `SELECT ${cols.join(', ')} FROM Asset WHERE ${whereClauses.join(' AND ')} LIMIT 1`;
      if (orderBy) {
        const orderParts = Object.entries(orderBy).map(([k, v]) => `${this.escapeColumn(k)} ${v.toUpperCase()}`);
        sql += ` ORDER BY ${orderParts.join(', ')}`;
      }
      const rows = await this.query<RowDataPacket[]>(sql, values);
      return rows[0] || null;
    },

    count: async ({ where }: { where?: Record<string, any> }) => {
      let sql = 'SELECT COUNT(*) as count FROM Asset';
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      const rows = await this.query<RowDataPacket[]>(sql, values);
      return Number(rows[0].count);
    },

    create: async ({ data }: { data: Record<string, any> }) => {
      const now = new Date();
      const insertData = { id: this.generateUuid(), createdAt: now, updatedAt: now, ...data };
      const cols = Object.keys(insertData);
      const values = Object.values(insertData);
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT INTO Asset (${cols.map(c => this.escapeColumn(c)).join(', ')}) VALUES (${placeholders})`;
      await this.execute(sql, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM Asset WHERE id = ? LIMIT 1`, [insertData.id]);
      return rows[0];
    },

    update: async ({ where, data }: { where: Record<string, any>; data: Record<string, any> }) => {
      const setClauses = Object.keys(data).map(k => `${this.escapeColumn(k)} = ?`);
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = [...Object.values(data), ...Object.values(where)];
      const sql = `UPDATE Asset SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`;
      await this.execute(sql, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM Asset WHERE id = ? LIMIT 1`, [where.id]);
      return rows[0];
    },
  };

  sla = {
    findMany: async ({ where }: { where?: Record<string, any> }) => {
      let sql = 'SELECT * FROM SLA';
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      return this.query<RowDataPacket[]>(sql, values);
    },

    findUnique: async ({ where }: { where: Record<string, any> }) => {
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = Object.values(where);
      const rows = await this.query<RowDataPacket[]>(
        `SELECT * FROM SLA WHERE ${whereClauses.join(' AND ')} LIMIT 1`,
        values,
      );
      return rows[0] || null;
    },
  };

  notification = {
    create: async ({ data }: { data: Record<string, any> }) => {
      const insertData = { id: this.generateUuid(), createdAt: new Date(), ...data };
      const cols = Object.keys(insertData);
      const values = Object.values(insertData);
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT INTO Notification (${cols.map(c => this.escapeColumn(c)).join(', ')}) VALUES (${placeholders})`;
      await this.execute(sql, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM Notification WHERE id = ? LIMIT 1`, [insertData.id]);
      return rows[0];
    },

    findMany: async ({ where, orderBy, skip, take }: { where?: Record<string, any>; orderBy?: Record<string, 'asc' | 'desc'>; skip?: number; take?: number }) => {
      let sql = 'SELECT * FROM Notification';
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      if (orderBy) {
        const orderParts = Object.entries(orderBy).map(([k, v]) => `${this.escapeColumn(k)} ${v.toUpperCase()}`);
        sql += ` ORDER BY ${orderParts.join(', ')}`;
      }
      if (take !== undefined) { sql += ` LIMIT ?`; values.push(take); }
      if (skip !== undefined) { sql += ` OFFSET ?`; values.push(skip); }
      return this.query<RowDataPacket[]>(sql, values);
    },

    count: async ({ where }: { where?: Record<string, any> }) => {
      let sql = 'SELECT COUNT(*) as count FROM Notification';
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      const rows = await this.query<RowDataPacket[]>(sql, values);
      return Number(rows[0].count);
    },
  };

  role = {
    findMany: async ({ where, include }: { where?: Record<string, any>; include?: Record<string, any> }) => {
      let sql = 'SELECT * FROM Role';
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      const rows = await this.query<RowDataPacket[]>(sql, values);
      if (include?.permissions) {
        for (const row of rows) {
          const permRows = await this.query<RowDataPacket[]>(
            `SELECT rp.*, p.* FROM RolePermission rp JOIN Permission p ON rp.permissionId = p.id WHERE rp.roleId = ?`,
            [row.id],
          );
          row.permissions = permRows;
        }
      }
      return rows;
    },

    findUnique: async ({ where, include }: { where: Record<string, any>; include?: Record<string, any> }) => {
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = Object.values(where);
      const rows = await this.query<RowDataPacket[]>(
        `SELECT * FROM Role WHERE ${whereClauses.join(' AND ')} LIMIT 1`,
        values,
      );
      const role = rows[0];
      if (role && include?.permissions) {
        const permRows = await this.query<RowDataPacket[]>(
          `SELECT rp.*, p.* FROM RolePermission rp JOIN Permission p ON rp.permissionId = p.id WHERE rp.roleId = ?`,
          [role.id],
        );
        role.permissions = permRows;
      }
      return role;
    },

    create: async ({ data }: { data: Record<string, any> }) => {
      const now = new Date();
      const insertData = { id: this.generateUuid(), createdAt: now, updatedAt: now, ...data };
      const cols = Object.keys(insertData);
      const values = Object.values(insertData);
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT INTO Role (${cols.map(c => this.escapeColumn(c)).join(', ')}) VALUES (${placeholders})`;
      await this.execute(sql, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM Role WHERE id = ? LIMIT 1`, [insertData.id]);
      return rows[0];
    },

    update: async ({ where, data }: { where: Record<string, any>; data: Record<string, any> }) => {
      const setClauses = Object.keys(data).map(k => `${this.escapeColumn(k)} = ?`);
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = [...Object.values(data), ...Object.values(where)];
      const sql = `UPDATE Role SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`;
      await this.execute(sql, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM Role WHERE id = ? LIMIT 1`, [where.id]);
      return rows[0];
    },

    delete: async ({ where }: { where: Record<string, any> }) => {
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = Object.values(where);
      const sql = `DELETE FROM Role WHERE ${whereClauses.join(' AND ')}`;
      await this.execute(sql, values);
      return { success: true };
    },
  };

  permission = {
    findMany: async () => {
      return this.query<RowDataPacket[]>('SELECT * FROM Permission');
    },

    findMany: async ({ where }: { where?: Record<string, any> }) => {
      let sql = 'SELECT * FROM Permission';
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          if (typeof v === 'object' && v?.in !== undefined) { values.push(v.in); return `${this.escapeColumn(k)} IN (?)`; }
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      return this.query<RowDataPacket[]>(sql, values);
    },
  };

  rolePermission = {
    findMany: async ({ where, include }: { where?: Record<string, any>; include?: Record<string, any> }) => {
      let sql = 'SELECT * FROM RolePermission';
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      return this.query<RowDataPacket[]>(sql, values);
    },

    create: async ({ data }: { data: Record<string, any> }) => {
      const cols = Object.keys(data);
      const values = Object.values(data);
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT INTO RolePermission (${cols.map(c => this.escapeColumn(c)).join(', ')}) VALUES (${placeholders})`;
      await this.execute(sql, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM RolePermission WHERE roleId = ? AND permissionId = ? LIMIT 1`, [data.roleId, data.permissionId]);
      return rows[0];
    },

    deleteMany: async ({ where }: { where: Record<string, any> }) => {
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = Object.values(where);
      const sql = `DELETE FROM RolePermission WHERE ${whereClauses.join(' AND ')}`;
      await this.execute(sql, values);
      return { count: 0 };
    },
  };

  userRole = {
    findMany: async ({ where, include }: { where?: Record<string, any>; include?: Record<string, any> }) => {
      let sql = 'SELECT * FROM UserRole';
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      const rows = await this.query<RowDataPacket[]>(sql, values);
      if (include?.role) {
        for (const row of rows) {
          const roleRows = await this.query<RowDataPacket[]>(`SELECT * FROM Role WHERE id = ? LIMIT 1`, [row.roleId]);
          row.role = roleRows[0];
          if (include.role.include?.permissions) {
            const permRows = await this.query<RowDataPacket[]>(
              `SELECT rp.*, p.* FROM RolePermission rp JOIN Permission p ON rp.permissionId = p.id WHERE rp.roleId = ?`,
              [row.roleId],
            );
            row.role.permissions = permRows;
          }
        }
      }
      return rows;
    },

    create: async ({ data }: { data: Record<string, any> }) => {
      const cols = Object.keys(data);
      const values = Object.values(data);
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT INTO UserRole (${cols.map(c => this.escapeColumn(c)).join(', ')}) VALUES (${placeholders})`;
      await this.execute(sql, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM UserRole WHERE userId = ? AND roleId = ? LIMIT 1`, [data.userId, data.roleId]);
      return rows[0];
    },

    delete: async ({ where }: { where: Record<string, any> }) => {
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = Object.values(where);
      const sql = `DELETE FROM UserRole WHERE ${whereClauses.join(' AND ')}`;
      await this.execute(sql, values);
      return { success: true };
    },
  };

  auditLog = {
    create: async ({ data }: { data: Record<string, any> }) => {
      const cols = Object.keys(data);
      const values = Object.values(data);
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT INTO AuditLog (${cols.map(c => this.escapeColumn(c)).join(', ')}) VALUES (${placeholders})`;
      await this.execute(sql, values);
      return data;
    },

    findMany: async ({ where, orderBy, skip, take }: { where?: Record<string, any>; orderBy?: Record<string, 'asc' | 'desc'>; skip?: number; take?: number }) => {
      let sql = 'SELECT * FROM AuditLog';
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      if (orderBy) {
        const orderParts = Object.entries(orderBy).map(([k, v]) => `${this.escapeColumn(k)} ${v.toUpperCase()}`);
        sql += ` ORDER BY ${orderParts.join(', ')}`;
      }
      if (take !== undefined) { sql += ` LIMIT ?`; values.push(take); }
      if (skip !== undefined) { sql += ` OFFSET ?`; values.push(skip); }
      return this.query<RowDataPacket[]>(sql, values);
    },

    count: async ({ where }: { where?: Record<string, any> }) => {
      let sql = 'SELECT COUNT(*) as count FROM AuditLog';
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      const rows = await this.query<RowDataPacket[]>(sql, values);
      return Number(rows[0].count);
    },
  };

  workflow = {
    findMany: async ({ where, include, orderBy }: { where?: Record<string, any>; include?: Record<string, any>; orderBy?: Record<string, 'asc' | 'desc'> }) => {
      let sql = 'SELECT * FROM Workflow';
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      if (orderBy) {
        const orderParts = Object.entries(orderBy).map(([k, v]) => `${this.escapeColumn(k)} ${v.toUpperCase()}`);
        sql += ` ORDER BY ${orderParts.join(', ')}`;
      }
      const rows = await this.query<RowDataPacket[]>(sql, values);
      if (include?.steps) {
        for (const row of rows) {
          const stepOrder = include.steps.orderBy?.stepOrder === 'asc' ? 'ASC' : 'DESC';
          const stepRows = await this.query<RowDataPacket[]>(`SELECT * FROM WorkflowStep WHERE workflowId = ? ORDER BY stepOrder ${stepOrder}`, [row.id]);
          row.steps = stepRows;
        }
      }
      if (include?.runs) {
        for (const row of rows) {
          const limit = include.runs.take || 10;
          const runRows = await this.query<RowDataPacket[]>(`SELECT * FROM WorkflowRun WHERE workflowId = ? ORDER BY startedAt DESC LIMIT ?`, [row.id, limit]);
          row.runs = runRows;
        }
      }
      return rows;
    },

    findFirst: async ({ where, include }: { where: Record<string, any>; include?: Record<string, any> }) => {
      const whereClauses = Object.entries(where).map(([k, v]) => {
        if (v === null) return `${this.escapeColumn(k)} IS NULL`;
        return `${this.escapeColumn(k)} = ?`;
      }).filter(Boolean);
      const values = Object.values(where).filter(v => v !== null);
      const rows = await this.query<RowDataPacket[]>(
        `SELECT * FROM Workflow WHERE ${whereClauses.join(' AND ')} LIMIT 1`,
        values,
      );
      const workflow = rows[0];
      if (workflow && include) {
        if (include.steps) {
          const stepOrder = include.steps.orderBy?.stepOrder === 'asc' ? 'ASC' : 'DESC';
          const stepRows = await this.query<RowDataPacket[]>(`SELECT * FROM WorkflowStep WHERE workflowId = ? ORDER BY stepOrder ${stepOrder}`, [workflow.id]);
          workflow.steps = stepRows;
        }
        if (include.runs) {
          const limit = include.runs.take || 10;
          const runRows = await this.query<RowDataPacket[]>(`SELECT * FROM WorkflowRun WHERE workflowId = ? ORDER BY startedAt DESC LIMIT ?`, [workflow.id, limit]);
          workflow.runs = runRows;
        }
      }
      return workflow;
    },

    create: async ({ data, include }: { data: Record<string, any>; include?: Record<string, any> }) => {
      const { steps, ...workflowData } = data;
      const workflowId = this.generateUuid();
      const now = new Date();
      const insertData = { id: workflowId, createdAt: now, updatedAt: now, ...workflowData };
      const cols = Object.keys(insertData);
      const values = Object.values(insertData);
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT INTO Workflow (${cols.map(c => this.escapeColumn(c)).join(', ')}) VALUES (${placeholders})`;
      await this.execute(sql, values);

      if (steps?.create) {
        for (const step of steps.create) {
          await this.execute(
            `INSERT INTO WorkflowStep (workflowId, stepOrder, action, config) VALUES (?, ?, ?, ?)`,
            [workflowId, step.stepOrder, step.action, typeof step.config === 'object' ? JSON.stringify(step.config) : step.config],
          );
        }
      }

      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM Workflow WHERE id = ? LIMIT 1`, [workflowId]);
      const workflow = rows[0];
      if (workflow && include?.steps) {
        const stepOrder = include.steps.orderBy?.stepOrder === 'asc' ? 'ASC' : 'DESC';
        const stepRows = await this.query<RowDataPacket[]>(`SELECT * FROM WorkflowStep WHERE workflowId = ? ORDER BY stepOrder ${stepOrder}`, [workflow.id]);
        workflow.steps = stepRows;
      }
      return workflow;
    },

    update: async ({ where, data }: { where: Record<string, any>; data: Record<string, any> }) => {
      const setClauses = Object.keys(data).map(k => `${this.escapeColumn(k)} = ?`);
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = [...Object.values(data), ...Object.values(where)];
      const sql = `UPDATE Workflow SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`;
      await this.execute(sql, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM Workflow WHERE id = ? LIMIT 1`, [where.id]);
      return rows[0];
    },
  };

  workflowRun = {
    create: async ({ data }: { data: Record<string, any> }) => {
      const { steps, ...runData } = data;
      const runId = this.generateUuid();
      const now = new Date();
      const insertData = { id: runId, startedAt: now, ...runData };
      const cols = Object.keys(insertData);
      const values = Object.values(insertData);
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT INTO WorkflowRun (${cols.map(c => this.escapeColumn(c)).join(', ')}) VALUES (${placeholders})`;
      await this.execute(sql, values);

      if (steps?.create) {
        for (const step of steps.create) {
          await this.execute(
            `INSERT INTO WorkflowRunStep (runId, stepId, status) VALUES (?, ?, ?)`,
            [runId, step.stepId, step.status || 'pending'],
          );
        }
      }

      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM WorkflowRun WHERE id = ? LIMIT 1`, [runId]);
      return rows[0];
    },

    findMany: async ({ where, include, orderBy }: { where?: Record<string, any>; include?: Record<string, any>; orderBy?: Record<string, 'asc' | 'desc'> }) => {
      let sql = 'SELECT * FROM WorkflowRun';
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      if (orderBy) {
        const orderParts = Object.entries(orderBy).map(([k, v]) => `${this.escapeColumn(k)} ${v.toUpperCase()}`);
        sql += ` ORDER BY ${orderParts.join(', ')}`;
      }
      const rows = await this.query<RowDataPacket[]>(sql, values);
      if (include?.steps) {
        for (const row of rows) {
          const stepRows = await this.query<RowDataPacket[]>(`SELECT * FROM WorkflowRunStep WHERE runId = ?`, [row.id]);
          row.steps = stepRows;
        }
      }
      if (include?.ticket) {
        for (const row of rows) {
          const ticketCols = include.ticket.select ? Object.keys(include.ticket.select).filter(k => include.ticket.select[k]) : ['*'];
          const ticketRows = await this.query<RowDataPacket[]>(`SELECT ${ticketCols.join(', ')} FROM Ticket WHERE id = ? LIMIT 1`, [row.ticketId]);
          row.ticket = ticketRows[0] || null;
        }
      }
      return rows;
    },
  };

  rmmProviderConfig = {
    findMany: async ({ where }: { where?: Record<string, any> }) => {
      let sql = 'SELECT * FROM RmmProviderConfig';
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      return this.query<RowDataPacket[]>(sql, values);
    },

    findFirst: async ({ where }: { where: Record<string, any> }) => {
      const whereClauses = Object.entries(where).map(([k, v]) => {
        if (v === null) return `${this.escapeColumn(k)} IS NULL`;
        return `${this.escapeColumn(k)} = ?`;
      }).filter(Boolean);
      const values = Object.values(where).filter(v => v !== null);
      const rows = await this.query<RowDataPacket[]>(
        `SELECT * FROM RmmProviderConfig WHERE ${whereClauses.join(' AND ')} LIMIT 1`,
        values,
      );
      return rows[0] || null;
    },

    findUnique: async ({ where }: { where: Record<string, any> }) => {
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = Object.values(where);
      const rows = await this.query<RowDataPacket[]>(
        `SELECT * FROM RmmProviderConfig WHERE ${whereClauses.join(' AND ')} LIMIT 1`,
        values,
      );
      return rows[0] || null;
    },

    create: async ({ data }: { data: Record<string, any> }) => {
      const now = new Date();
      const insertData = { id: this.generateUuid(), createdAt: now, updatedAt: now, ...data };
      const cols = Object.keys(insertData);
      const values = Object.values(insertData);
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT INTO RmmProviderConfig (${cols.map(c => this.escapeColumn(c)).join(', ')}) VALUES (${placeholders})`;
      await this.execute(sql, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM RmmProviderConfig WHERE id = ? LIMIT 1`, [insertData.id]);
      return rows[0];
    },

    update: async ({ where, data }: { where: Record<string, any>; data: Record<string, any> }) => {
      const setClauses = Object.keys(data).map(k => `${this.escapeColumn(k)} = ?`);
      const whereClauses = Object.entries(where).map(([k, v]) => `${this.escapeColumn(k)} = ?`);
      const values = [...Object.values(data), ...Object.values(where)];
      const sql = `UPDATE RmmProviderConfig SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`;
      await this.execute(sql, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM RmmProviderConfig WHERE id = ? LIMIT 1`, [where.id]);
      return rows[0];
    },
  };

  kbArticle = {
    findMany: async ({ where, orderBy, skip, take }: { where?: Record<string, any>; orderBy?: Record<string, 'asc' | 'desc'>; skip?: number; take?: number }) => {
      let sql = 'SELECT * FROM KbArticle';
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      if (orderBy) {
        const orderParts = Object.entries(orderBy).map(([k, v]) => `${this.escapeColumn(k)} ${v.toUpperCase()}`);
        sql += ` ORDER BY ${orderParts.join(', ')}`;
      }
      if (take !== undefined) { sql += ` LIMIT ?`; values.push(take); }
      if (skip !== undefined) { sql += ` OFFSET ?`; values.push(skip); }
      return this.query<RowDataPacket[]>(sql, values);
    },
  };

  ticketTimeline = {
    findMany: async ({ where, orderBy, include }: { where?: Record<string, any>; orderBy?: Record<string, 'asc' | 'desc'>; include?: Record<string, any> }) => {
      let sql = 'SELECT * FROM TicketTimeline';
      const values: any[] = [];
      if (where && Object.keys(where).length > 0) {
        const clauses = Object.entries(where).map(([k, v]) => {
          if (v === null) return `${this.escapeColumn(k)} IS NULL`;
          values.push(v);
          return `${this.escapeColumn(k)} = ?`;
        });
        sql += ` WHERE ${clauses.join(' AND ')}`;
      }
      if (orderBy) {
        const orderParts = Object.entries(orderBy).map(([k, v]) => `${this.escapeColumn(k)} ${v.toUpperCase()}`);
        sql += ` ORDER BY ${orderParts.join(', ')}`;
      }
      const rows = await this.query<RowDataPacket[]>(sql, values);
      if (include?.actor) {
        for (const row of rows) {
          const actorRows = await this.query<RowDataPacket[]>(`SELECT id, firstName, lastName FROM User WHERE id = ? LIMIT 1`, [row.actorId]);
          row.actor = actorRows[0] || null;
        }
      }
      return rows;
    },

    create: async ({ data, include }: { data: Record<string, any>; include?: Record<string, any> }) => {
      const insertData = { id: this.generateUuid(), createdAt: new Date(), ...data };
      const cols = Object.keys(insertData);
      const values = Object.values(insertData);
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT INTO TicketTimeline (${cols.map(c => this.escapeColumn(c)).join(', ')}) VALUES (${placeholders})`;
      await this.execute(sql, values);
      const rows = await this.query<RowDataPacket[]>(`SELECT * FROM TicketTimeline WHERE id = ? LIMIT 1`, [insertData.id]);
      const entry = rows[0];
      if (entry && include?.actor) {
        const actorRows = await this.query<RowDataPacket[]>(`SELECT id, firstName, lastName FROM User WHERE id = ? LIMIT 1`, [entry.actorId]);
        entry.actor = actorRows[0] || null;
      }
      return entry;
    },
  };

  private async enrichTicket(ticket: any, include?: Record<string, any>) {
    if (!ticket) return null;
    if (include) {
      if (include.createdBy) {
        const rows = await this.query<RowDataPacket[]>(`SELECT id, firstName, lastName, email FROM User WHERE id = ? LIMIT 1`, [ticket.createdById]);
        ticket.createdBy = rows[0] || null;
      }
      if (include.assignedTo) {
        if (ticket.assignedToId) {
          const rows = await this.query<RowDataPacket[]>(`SELECT id, firstName, lastName, email FROM User WHERE id = ? LIMIT 1`, [ticket.assignedToId]);
          ticket.assignedTo = rows[0] || null;
        } else {
          ticket.assignedTo = null;
        }
      }
      if (include.resolvedBy) {
        if (ticket.resolvedById) {
          const rows = await this.query<RowDataPacket[]>(`SELECT id, firstName, lastName, email FROM User WHERE id = ? LIMIT 1`, [ticket.resolvedById]);
          ticket.resolvedBy = rows[0] || null;
        } else {
          ticket.resolvedBy = null;
        }
      }
      if (include.asset) {
        if (ticket.assetId) {
          const rows = await this.query<RowDataPacket[]>(`SELECT * FROM Asset WHERE id = ? LIMIT 1`, [ticket.assetId]);
          ticket.asset = rows[0] || null;
        } else {
          ticket.asset = null;
        }
      }
      if (include.sla) {
        if (ticket.slaId) {
          const rows = await this.query<RowDataPacket[]>(`SELECT * FROM SLA WHERE id = ? LIMIT 1`, [ticket.slaId]);
          ticket.sla = rows[0] || null;
        } else {
          ticket.sla = null;
        }
      }
      if (include.timeline) {
        const order = include.timeline.orderBy?.createdAt === 'desc' ? 'DESC' : 'ASC';
        const limit = include.timeline.take || 50;
        const rows = await this.query<RowDataPacket[]>(`SELECT * FROM TicketTimeline WHERE ticketId = ? ORDER BY createdAt ${order} LIMIT ?`, [ticket.id, limit]);
        if (include.timeline.include?.actor) {
          for (const row of rows) {
            const actorRows = await this.query<RowDataPacket[]>(`SELECT id, firstName, lastName FROM User WHERE id = ? LIMIT 1`, [row.actorId]);
            row.actor = actorRows[0] || null;
          }
        }
        ticket.timeline = rows;
      }
      if (include.attachments) {
        const rows = await this.query<RowDataPacket[]>(`SELECT * FROM TicketAttachment WHERE ticketId = ?`, [ticket.id]);
        if (include.attachments.include?.uploadedBy) {
          for (const row of rows) {
            const userRows = await this.query<RowDataPacket[]>(`SELECT id, firstName, lastName FROM User WHERE id = ? LIMIT 1`, [row.uploadedById]);
            row.uploadedBy = userRows[0] || null;
          }
        }
        ticket.attachments = rows;
      }
      if (include.dispatches) {
        const rows = await this.query<RowDataPacket[]>(`SELECT * FROM Dispatch WHERE ticketId = ?`, [ticket.id]);
        ticket.dispatches = rows;
      }
      if (include.contract) {
        if (ticket.contractId) {
          const rows = await this.query<RowDataPacket[]>(`SELECT * FROM Contract WHERE id = ? LIMIT 1`, [ticket.contractId]);
          ticket.contract = rows[0] || null;
        } else {
          ticket.contract = null;
        }
      }
    }
    return ticket;
  }

  private escapeColumn(col: string): string {
    return `\`${col.replace(/`/g, '')}\``;
  }

  private generateUuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  async $connect() {
    const conn = await this.pool.getConnection();
    conn.release();
  }

  async $disconnect() {
    await this.pool.end();
  }

  async $queryRaw(strings: TemplateStringsArray, ...values: any[]) {
    const sql = strings.join('?');
    return this.query(sql, values);
  }
}

class TransactionClient {
  constructor(private conn: any) {}

  async query<T = RowDataPacket[]>(sql: string, values?: any[]): Promise<T> {
    const [rows] = await this.conn.execute(sql, values || []);
    return rows as T;
  }

  async execute(sql: string, values?: any[]): Promise<ResultSetHeader> {
    const [result] = await this.conn.execute(sql, values || []);
    return result as ResultSetHeader;
  }
}
