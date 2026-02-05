import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Database Service
 * Manages metadata storage and retrieval
 */
export class DatabaseService {
  constructor(dbPath = './data/metadata.db') {
    this.db = new Database(dbPath);
    this.initDatabase();
  }

  /**
   * Initialize database schema
   */
  initDatabase() {
    // Certificates metadata table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS certificates (
        deposit_id INTEGER PRIMARY KEY,
        plan_id INTEGER NOT NULL,
        deposit_amount TEXT NOT NULL,
        deposit_time INTEGER NOT NULL,
        tenor_days INTEGER NOT NULL,
        apr_bps INTEGER NOT NULL,
        maturity_timestamp INTEGER NOT NULL,
        
        image_hash TEXT NOT NULL,
        metadata_hash TEXT NOT NULL,
        image_url TEXT NOT NULL,
        metadata_url TEXT NOT NULL,
        
        status TEXT DEFAULT 'active',
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_status ON certificates(status);
      CREATE INDEX IF NOT EXISTS idx_plan_id ON certificates(plan_id);
      CREATE INDEX IF NOT EXISTS idx_created_at ON certificates(created_at);

      -- Metadata generation log
      CREATE TABLE IF NOT EXISTS generation_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deposit_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        status TEXT NOT NULL,
        error_message TEXT,
        metadata TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_log_deposit ON generation_log(deposit_id);
    `);

    console.log('[Database] Initialized successfully');
  }

  /**
   * Save certificate metadata
   */
  saveCertificate(data) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO certificates (
        deposit_id, plan_id, deposit_amount, deposit_time, 
        tenor_days, apr_bps, maturity_timestamp,
        image_hash, metadata_hash, image_url, metadata_url,
        status, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
    `);

    const result = stmt.run(
      data.depositId,
      data.planId,
      data.depositAmount,
      data.depositTime,
      data.tenorDays,
      data.aprBps,
      data.maturityTimestamp,
      data.imageHash,
      data.metadataHash,
      data.imageUrl,
      data.metadataUrl,
      data.status || 'active'
    );

    return result.changes > 0;
  }

  /**
   * Get certificate by deposit ID
   */
  getCertificate(depositId) {
    const stmt = this.db.prepare(`
      SELECT * FROM certificates WHERE deposit_id = ?
    `);

    return stmt.get(depositId);
  }

  /**
   * Get all certificates
   */
  getAllCertificates(filters = {}) {
    let query = 'SELECT * FROM certificates WHERE 1=1';
    const params = [];

    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    if (filters.planId) {
      query += ' AND plan_id = ?';
      params.push(filters.planId);
    }

    query += ' ORDER BY deposit_id DESC';

    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    const stmt = this.db.prepare(query);
    return stmt.all(...params);
  }

  /**
   * Update certificate status
   */
  updateCertificateStatus(depositId, status) {
    const stmt = this.db.prepare(`
      UPDATE certificates 
      SET status = ?, updated_at = strftime('%s', 'now')
      WHERE deposit_id = ?
    `);

    return stmt.run(status, depositId).changes > 0;
  }

  /**
   * Check if certificate exists
   */
  certificateExists(depositId) {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM certificates WHERE deposit_id = ?
    `);

    const result = stmt.get(depositId);
    return result.count > 0;
  }

  /**
   * Log generation activity
   */
  logGeneration(depositId, action, status, errorMessage = null, metadata = null) {
    const stmt = this.db.prepare(`
      INSERT INTO generation_log (deposit_id, action, status, error_message, metadata)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      depositId,
      action,
      status,
      errorMessage,
      metadata ? JSON.stringify(metadata) : null
    );
  }

  /**
   * Get generation logs for a certificate
   */
  getGenerationLogs(depositId, limit = 10) {
    const stmt = this.db.prepare(`
      SELECT * FROM generation_log 
      WHERE deposit_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);

    return stmt.all(depositId, limit);
  }

  /**
   * Get statistics
   */
  getStats() {
    const stats = {
      total: this.db.prepare('SELECT COUNT(*) as count FROM certificates').get().count,
      active: this.db.prepare('SELECT COUNT(*) as count FROM certificates WHERE status = ?').get('active').count,
      matured: this.db.prepare('SELECT COUNT(*) as count FROM certificates WHERE status = ?').get('matured').count,
      withdrawn: this.db.prepare('SELECT COUNT(*) as count FROM certificates WHERE status = ?').get('withdrawn').count,
    };

    // Total deposit amount
    const amountResult = this.db.prepare(`
      SELECT SUM(CAST(deposit_amount as REAL)) as total 
      FROM certificates WHERE status = 'active'
    `).get();

    stats.totalDepositAmount = amountResult.total || 0;

    return stats;
  }

  /**
   * Search certificates
   */
  searchCertificates(searchTerm, limit = 20) {
    const stmt = this.db.prepare(`
      SELECT * FROM certificates 
      WHERE deposit_id LIKE ? 
         OR plan_id LIKE ?
         OR deposit_amount LIKE ?
      ORDER BY deposit_id DESC
      LIMIT ?
    `);

    const term = `%${searchTerm}%`;
    return stmt.all(term, term, term, limit);
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
  }
}

// Singleton instance
let dbInstance = null;

export function getDatabase() {
  if (!dbInstance) {
    dbInstance = new DatabaseService();
  }
  return dbInstance;
}

export const databaseService = getDatabase();