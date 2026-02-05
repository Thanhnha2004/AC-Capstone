import axios from 'axios';
import FormData from 'form-data';
import { config } from '../config/index.js';

/**
 * IPFS Service using Pinata
 * Upload files and JSON to IPFS
 */
export class IPFSService {
  constructor() {
    this.apiKey = config.pinata.apiKey;
    this.secretKey = config.pinata.secretKey;
    this.baseUrl = 'https://api.pinata.cloud';
    this.gateway = config.pinata.gateway;
  }

  /**
   * Upload JSON to IPFS
   */
  async uploadJSON(metadata, name = 'metadata.json') {
    try {
      const url = `${this.baseUrl}/pinning/pinJSONToIPFS`;

      const response = await axios.post(
        url,
        {
          pinataContent: metadata,
          pinataMetadata: { name },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            pinata_api_key: this.apiKey,
            pinata_secret_api_key: this.secretKey,
          },
        }
      );

      return response.data.IpfsHash;
    } catch (error) {
      console.error('Error uploading JSON:', error.response?.data || error.message);
      throw new Error(`IPFS upload failed: ${error.message}`);
    }
  }

  /**
   * Upload Buffer to IPFS
   */
  async uploadBuffer(buffer, filename = 'image.png') {
    try {
      const url = `${this.baseUrl}/pinning/pinFileToIPFS`;
      const formData = new FormData();

      formData.append('file', buffer, {
        filename,
        contentType: 'image/png',
      });

      formData.append('pinataMetadata', JSON.stringify({ name: filename }));

      const response = await axios.post(url, formData, {
        maxBodyLength: Infinity,
        headers: {
          ...formData.getHeaders(),
          pinata_api_key: this.apiKey,
          pinata_secret_api_key: this.secretKey,
        },
      });

      return response.data.IpfsHash;
    } catch (error) {
      console.error('Error uploading buffer:', error.response?.data || error.message);
      throw new Error(`IPFS upload failed: ${error.message}`);
    }
  }

  /**
   * Get gateway URL
   */
  getGatewayUrl(hash) {
    return `${this.gateway}/${hash}`;
  }

  /**
   * Get IPFS protocol URL
   */
  getIPFSUrl(hash) {
    return `ipfs://${hash}`;
  }
}

export const ipfsService = new IPFSService();