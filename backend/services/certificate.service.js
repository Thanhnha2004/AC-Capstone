import { createCanvas } from 'canvas';
import { config } from '../config/index.js';

/**
 * Certificate Image Generator
 */
export class CertificateGenerator {
  constructor() {
    this.width = config.certificate.width;
    this.height = config.certificate.height;
    this.bgColor = config.certificate.backgroundColor;
    this.primaryColor = config.certificate.primaryColor;
    this.secondaryColor = config.certificate.secondaryColor;
    this.textColor = config.certificate.textColor;
  }

  /**
   * Generate certificate PNG
   */
  async generateCertificate(data) {
    const canvas = createCanvas(this.width, this.height);
    const ctx = canvas.getContext('2d');

    // Draw layers
    this.drawBackground(ctx);
    this.drawBorder(ctx);
    this.drawTitle(ctx);
    this.drawCertificateNumber(ctx, data.depositId);
    this.drawMainContent(ctx, data);
    this.drawFooter(ctx);
    this.drawDecorations(ctx);

    return canvas.toBuffer('image/png');
  }

  drawBackground(ctx) {
    const gradient = ctx.createLinearGradient(0, 0, this.width, this.height);
    gradient.addColorStop(0, this.bgColor);
    gradient.addColorStop(1, '#16213e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  drawBorder(ctx) {
    const padding = 40;
    
    // Outer border
    ctx.strokeStyle = this.primaryColor;
    ctx.lineWidth = 4;
    ctx.strokeRect(padding, padding, this.width - padding * 2, this.height - padding * 2);

    // Inner border
    ctx.strokeStyle = this.secondaryColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(padding + 10, padding + 10, this.width - (padding + 10) * 2, this.height - (padding + 10) * 2);
  }

  drawTitle(ctx) {
    ctx.fillStyle = this.secondaryColor;
    ctx.font = 'bold 60px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('DEPOSIT CERTIFICATE', this.width / 2, 140);

    ctx.fillStyle = '#888';
    ctx.font = '24px Arial';
    ctx.fillText('Saving Bank Protocol', this.width / 2, 180);
  }

  drawCertificateNumber(ctx, depositId) {
    ctx.fillStyle = '#666';
    ctx.font = '20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`Certificate #${depositId}`, this.width / 2, 230);
  }

  drawMainContent(ctx, data) {
    const { planId, depositAmount, tenorDays, aprBps, depositTime, maturityDate } = data;
    const centerX = this.width / 2;
    let y = 320;

    // Amount
    ctx.fillStyle = '#888';
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('DEPOSIT AMOUNT', centerX, y);
    
    y += 60;
    ctx.fillStyle = this.textColor;
    ctx.font = 'bold 72px Arial';
    ctx.fillText(this.formatAmount(depositAmount), centerX, y);

    // Details
    y += 100;
    const col1X = this.width / 4;
    const col2X = (this.width / 4) * 3;

    this.drawField(ctx, col1X, y, 'Plan ID', planId.toString());
    this.drawField(ctx, col1X, y + 80, 'Tenor', `${tenorDays} days`);
    this.drawField(ctx, col1X, y + 160, 'Deposit Date', this.formatDate(depositTime));

    this.drawField(ctx, col2X, y, 'APR', `${(aprBps / 100).toFixed(2)}%`);
    this.drawField(ctx, col2X, y + 80, 'Maturity', this.formatDate(maturityDate));
    this.drawField(ctx, col2X, y + 160, 'Status', 'Active');
  }

  drawField(ctx, x, y, label, value) {
    ctx.fillStyle = '#888';
    ctx.font = '18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y);

    ctx.fillStyle = this.textColor;
    ctx.font = 'bold 24px Arial';
    ctx.fillText(value, x, y + 35);
  }

  drawFooter(ctx) {
    ctx.fillStyle = '#555';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('This certificate represents a deposit in Saving Bank Protocol', this.width / 2, this.height - 80);
    ctx.fillText('Non-transferable • Blockchain Verified', this.width / 2, this.height - 50);
  }

  drawDecorations(ctx) {
    const corners = [
      [100, 100],
      [this.width - 100, 100],
      [100, this.height - 100],
      [this.width - 100, this.height - 100],
    ];

    corners.forEach(([x, y]) => {
      ctx.fillStyle = this.primaryColor;
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.arc(x, y, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
  }

  formatAmount(amount) {
    const value = Number(amount) / 1e18;
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value) + ' Tokens';
  }

  formatDate(timestamp) {
    const date = new Date(Number(timestamp) * 1000);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
}

export const certificateGenerator = new CertificateGenerator();