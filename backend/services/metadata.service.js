import { certificateGenerator } from './certificate.service.js';
import { ipfsService } from './ipfs.service.js';
import { databaseService } from './database.service.js';

/**
 * Metadata Service với Database Integration
 */
export class MetadataService {
  /**
   * Generate complete metadata và lưu vào database
   */
  async generateMetadata(certificateData) {
    const {
      depositId,
      planId,
      depositAmount,
      depositTime,
      tenorDays = 30,
      aprBps = 1000,
    } = certificateData;

    // Log start
    databaseService.logGeneration(depositId, 'generate_start', 'processing');

    try {
      // Check if already exists
      if (databaseService.certificateExists(depositId)) {
        console.log(`[Metadata] Certificate #${depositId} already exists, updating...`);
      }

      // Calculate maturity
      const maturityTimestamp = Number(depositTime) + (tenorDays * 24 * 60 * 60);

      console.log(`[Metadata] Generating for deposit #${depositId}...`);

      // Generate image
      const imageBuffer = await certificateGenerator.generateCertificate({
        depositId,
        planId,
        depositAmount,
        depositTime,
        tenorDays,
        aprBps,
        maturityDate: maturityTimestamp,
      });

      console.log('[Metadata] Uploading image to IPFS...');
      const imageHash = await ipfsService.uploadBuffer(
        imageBuffer,
        `certificate-${depositId}.png`
      );
      console.log(`[Metadata] Image: ${imageHash}`);

      // Create metadata
      const metadata = {
        name: `Saving Bank Certificate #${depositId}`,
        description: `Certificate of Deposit for ${this.formatAmount(depositAmount)} tokens in Plan ${planId} with ${(aprBps / 100).toFixed(2)}% APR`,
        image: ipfsService.getIPFSUrl(imageHash),
        external_url: `https://savingbank.io/certificates/${depositId}`,
        attributes: [
          { trait_type: 'Deposit ID', value: depositId },
          { trait_type: 'Plan ID', value: planId },
          { trait_type: 'Deposit Amount', display_type: 'number', value: depositAmount },
          { trait_type: 'Amount (Formatted)', value: this.formatAmount(depositAmount) },
          { trait_type: 'Tenor', value: `${tenorDays} days` },
          { trait_type: 'APR', value: `${(aprBps / 100).toFixed(2)}%` },
          { trait_type: 'Deposit Date', display_type: 'date', value: depositTime },
          { trait_type: 'Maturity Date', display_type: 'date', value: maturityTimestamp },
          { trait_type: 'Status', value: 'Active' },
        ],
      };

      console.log('[Metadata] Uploading metadata to IPFS...');
      const metadataHash = await ipfsService.uploadJSON(
        metadata,
        `metadata-${depositId}.json`
      );
      console.log(`[Metadata] Metadata: ${metadataHash}`);

      // Save to database
      const dbData = {
        depositId,
        planId,
        depositAmount,
        depositTime,
        tenorDays,
        aprBps,
        maturityTimestamp,
        imageHash,
        metadataHash,
        imageUrl: ipfsService.getGatewayUrl(imageHash),
        metadataUrl: ipfsService.getIPFSUrl(metadataHash),
        status: 'active',
      };

      databaseService.saveCertificate(dbData);
      console.log(`[Metadata] Saved to database: deposit #${depositId}`);

      // Log success
      databaseService.logGeneration(depositId, 'generate_complete', 'success', null, {
        imageHash,
        metadataHash,
      });

      return {
        metadata,
        imageHash,
        metadataHash,
        imageUrl: ipfsService.getGatewayUrl(imageHash),
        metadataUrl: ipfsService.getIPFSUrl(metadataHash),
        gatewayMetadataUrl: ipfsService.getGatewayUrl(metadataHash),
      };
    } catch (error) {
      // Log error
      databaseService.logGeneration(depositId, 'generate_failed', 'error', error.message);
      throw error;
    }
  }

  /**
   * Get metadata từ database
   */
  getMetadata(depositId) {
    const cert = databaseService.getCertificate(depositId);
    
    if (!cert) {
      return null;
    }

    return {
      depositId: cert.deposit_id,
      planId: cert.plan_id,
      depositAmount: cert.deposit_amount,
      depositTime: cert.deposit_time,
      tenorDays: cert.tenor_days,
      aprBps: cert.apr_bps,
      maturityTimestamp: cert.maturity_timestamp,
      imageHash: cert.image_hash,
      metadataHash: cert.metadata_hash,
      imageUrl: cert.image_url,
      metadataUrl: cert.metadata_url,
      gatewayMetadataUrl: cert.metadata_url.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/'),
      status: cert.status,
      createdAt: cert.created_at,
      updatedAt: cert.updated_at,
    };
  }

  /**
   * Get all certificates
   */
  getAllMetadata(filters = {}) {
    const certs = databaseService.getAllCertificates(filters);
    return certs.map(cert => ({
      depositId: cert.deposit_id,
      planId: cert.plan_id,
      depositAmount: cert.deposit_amount,
      formattedAmount: this.formatAmount(cert.deposit_amount),
      tenorDays: cert.tenor_days,
      aprBps: cert.apr_bps,
      aprPercent: (cert.apr_bps / 100).toFixed(2),
      status: cert.status,
      imageUrl: cert.image_url,
      metadataUrl: cert.metadata_url,
      createdAt: cert.created_at,
    }));
  }

  /**
   * Update certificate status
   */
  updateStatus(depositId, status) {
    return databaseService.updateCertificateStatus(depositId, status);
  }

  /**
   * Batch generate với database tracking
   */
  async batchGenerateMetadata(certificates) {
    const results = [];

    for (const cert of certificates) {
      try {
        const result = await this.generateMetadata(cert);
        results.push({
          success: true,
          depositId: cert.depositId,
          ...result,
        });
      } catch (error) {
        console.error(`[Metadata] Error for #${cert.depositId}:`, error.message);
        results.push({
          success: false,
          depositId: cert.depositId,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Search certificates
   */
  searchMetadata(searchTerm, limit = 20) {
    const certs = databaseService.searchCertificates(searchTerm, limit);
    return certs.map(cert => ({
      depositId: cert.deposit_id,
      planId: cert.plan_id,
      formattedAmount: this.formatAmount(cert.deposit_amount),
      status: cert.status,
      metadataUrl: cert.metadata_url,
    }));
  }

  /**
   * Get statistics
   */
  getStats() {
    const stats = databaseService.getStats();
    return {
      ...stats,
      totalDepositAmountFormatted: this.formatAmount(stats.totalDepositAmount.toString()),
    };
  }

  formatAmount(amount) {
    const value = Number(amount) / 1e18;
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }
}

export const metadataService = new MetadataService();