
import { Injectable, NotFoundException, InternalServerErrorException, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import * as fs from 'fs/promises'; // Use promises version of fs
import * as path from 'path';

// Placeholder for storing document/workflow state (in-memory for now)
// In a real app, this would be a database.
// Add 'export' before the interface
export interface DocumentState {
  fileId: string;
  originalFilename: string;
  savedFilename: string;
  filePath: string;
  tags?: any;
  signers?: any;
  status: 'uploaded' | 'tagged' | 'submitted' | 'signed_by_role2' | 'completed' | 'failed';
  openSignTemplateId?: string;
  role3Email?: string;
}

@Injectable()
export class EsignService {
  private documents: Map<string, DocumentState> = new Map();
  private readonly logger = new Logger(EsignService.name); // Add logger

  // Inject HttpService for API calls and ConfigService for API keys/URLs
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService
  ) {}

  handlePdfUpload(file: Express.Multer.File): DocumentState {
    const fileId = path.parse(file.filename).name; // Use filename without ext as ID for simplicity
    const docState: DocumentState = {
      fileId: fileId,
      originalFilename: file.originalname,
      savedFilename: file.filename,
      filePath: file.path,
      status: 'uploaded',
    };
    this.documents.set(fileId, docState);
    this.logger.log(`Document state created for ${fileId}: ${docState.originalFilename}`);
    return docState;
  }

  addTagsToFile(fileId: string, tagData: any): DocumentState {
    const doc = this.documents.get(fileId);
    if (!doc) {
      throw new NotFoundException(`Document with ID ${fileId} not found.`);
    }
    // Basic validation for tags structure (assuming it should have a 'widgets' array)
    if (!tagData || !Array.isArray(tagData.widgets)) {
        this.logger.warn(`Invalid or missing tag structure for document ${fileId}. Expected { widgets: [...] }`);
        throw new InternalServerErrorException('Invalid tag data format provided.');
    }
    doc.tags = tagData; // Store tag data
    doc.status = 'tagged';
    this.documents.set(fileId, doc);
    this.logger.log(`Tags added to document ${fileId}`);
    return doc;
  }

  async submitToOpenSign(fileId: string, signers: any): Promise<any> {
    const doc = this.documents.get(fileId);
    if (!doc) {
      throw new NotFoundException(`Document with ID ${fileId} not found.`);
    }
    if (!doc.tags || !Array.isArray(doc.tags.widgets) || doc.tags.widgets.length === 0) {
        this.logger.error(`Tags missing or invalid for document ${fileId}`);
        throw new InternalServerErrorException('Tags must be added and valid before submitting for signing.');
    }
    if (!signers || !signers.role1Email) { // Basic validation for signer info
        this.logger.error(`Signer information missing for document ${fileId}`);
        throw new InternalServerErrorException('Signer information (at least Role 1 email) is required.');
    }

    this.logger.log(`Preparing to submit document ${fileId} to OpenSignLabs...`);
    doc.signers = signers; // Store signer info
    doc.role3Email = signers.role3Email || ''; // Store initial Role 3 email if provided

    // --- OpenSignLabs API Call --- 
    const apiKey = this.configService.get<string>('OPENSIGN_API_KEY', 'YOUR_API_KEY_HERE'); // Use placeholder API key
    const apiUrl = this.configService.get<string>('OPENSIGN_API_URL', 'https://sandbox.opensignlabs.com/api/v1/createtemplate');

    let pdfBase64: string;
    try {
        const fileBuffer = await fs.readFile(doc.filePath);
        pdfBase64 = fileBuffer.toString('base64');
        this.logger.log(`Read and encoded PDF file ${doc.filePath} for document ${fileId}`);
    } catch (error) {
        this.logger.error(`Failed to read PDF file ${doc.filePath}: ${error.message}`, error.stack);
        doc.status = 'failed';
        this.documents.set(fileId, doc);
        throw new InternalServerErrorException('Failed to read PDF file for submission.');
    }

    // Construct roles carefully based on requirements
    const roles = [
        { role: 'Role 1', email: signers.role1Email, name: 'Role 1 Signer' },
        // Use a placeholder/dummy email for Role 2 as per requirement
        { role: 'Role 2', email: signers.role2Email || 'dummy-role2@example.com', name: 'Role 2 Signer' }, 
        // Role 3 email is initially empty/placeholder, will be updated later via webhook/API
        { role: 'Role 3', email: '', name: 'Role 3 Signer' } 
    ];

    const payload = {
        file: pdfBase64,
        title: `Signing Request - ${doc.originalFilename} (${fileId})`,
        sendInOrder: true, // Crucial for sequential signing
        roles: roles,
        widgets: doc.tags.widgets // Pass the widgets array from stored tags
        // Add other optional parameters like redirect_url, sender_name etc. if needed
    };

    this.logger.log(`Submitting payload to OpenSignLabs for document ${fileId}`);

    try {
        const response = await firstValueFrom(
            this.httpService.post(apiUrl, payload, {
                headers: {
                    'x-api-token': apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 30000 // 30 seconds timeout
            })
        );

        if (response.data && response.data.objectId) {
            doc.openSignTemplateId = response.data.objectId; // Store the returned template ID
            doc.status = 'submitted';
            this.documents.set(fileId, doc);
            this.logger.log(`Document ${fileId} submitted successfully. Template ID: ${doc.openSignTemplateId}`);
            return { success: true, message: 'Document submitted successfully.', templateId: doc.openSignTemplateId };
        } else {
            this.logger.error(`Unexpected response structure from OpenSignLabs for document ${fileId}: ${JSON.stringify(response.data)}`);
            doc.status = 'failed';
            this.documents.set(fileId, doc);
            throw new InternalServerErrorException('Received unexpected response from signing service.');
        }
    } catch (error) {
        this.logger.error(`Error submitting document ${fileId} to OpenSignLabs: ${error.message}`, error.stack);
        if (error.response) {
            this.logger.error(`OpenSignLabs API Error Response: Status ${error.response.status}, Data: ${JSON.stringify(error.response.data)}`);
        }
        doc.status = 'failed';
        this.documents.set(fileId, doc);
        const apiErrorMsg = error.response?.data?.message || 'Failed to communicate with signing service.';
        throw new InternalServerErrorException(`Failed to submit document for signing: ${apiErrorMsg}`);
    }
  }

  // --- Webhook Handling ---
  // Needs refinement based on actual OpenSignLabs webhook payload structure and API capabilities for updates.
  async handleWebhookEvent(webhookData: any): Promise<any> { // Make async if update call is needed
    this.logger.log(`Received webhook event: ${JSON.stringify(webhookData)}`);

    // **TODO**: Implement webhook signature validation for security.

    const eventType = webhookData.event?.type; // Adjust based on actual payload
    const templateId = webhookData.template_id; // Adjust based on actual payload
    const documentId = webhookData.document_id; // Adjust based on actual payload
    const signerInfo = webhookData.signer; // Adjust based on actual payload

    if (!templateId && !documentId) {
        this.logger.warn('Webhook received without template_id or document_id.');
        return { received: true, message: 'Webhook ignored (missing identifier).' };
    }

    // Find the document associated with this event
    let relevantDoc: DocumentState | undefined;
    const searchId = templateId || documentId; 
    for (const doc of this.documents.values()) {
        if (doc.openSignTemplateId === searchId) { 
            relevantDoc = doc;
            break;
        }
    }

    if (!relevantDoc) {
        this.logger.warn(`Received webhook for unknown identifier: ${searchId}`);
        return { received: true, message: 'Webhook received for unknown document/template.' };
    }

    this.logger.log(`Webhook relates to document: ${relevantDoc.fileId} (Template ID: ${relevantDoc.openSignTemplateId})`);

    try {
        // --- Webhook Logic ---
        if (eventType === 'document_signed' && signerInfo?.role === 'Role 2') {
            this.logger.log(`Document ${relevantDoc.fileId} signed by Role 2.`);
            relevantDoc.status = 'signed_by_role2';

            // **Dynamic Email Update Logic Placeholder**:
            // Check if the webhook payload contains the updated email for Role 3.
            // This structure (`webhookData.updated_emails.Role3`) is hypothetical.
            const updatedRole3Email = webhookData.updated_emails?.Role3 || webhookData.role3_email; 

            if (updatedRole3Email && updatedRole3Email !== relevantDoc.role3Email) {
                 this.logger.log(`Webhook indicates Role 3 email updated for document ${relevantDoc.fileId} to ${updatedRole3Email}`);
                 relevantDoc.role3Email = updatedRole3Email;
                 // **CRITICAL**: OpenSignLabs needs an API to update the recipient email *before* the workflow proceeds.
                 // If such an API exists, call it here.
                 // await this.updateOpenSignRecipient(relevantDoc.openSignTemplateId, 'Role 3', updatedRole3Email);
                 this.logger.warn(`Placeholder: Need to call OpenSignLabs API to update Role 3 email to ${updatedRole3Email} for template ${relevantDoc.openSignTemplateId}`);
            } else {
                 this.logger.warn(`Role 3 email not found in webhook payload for document ${relevantDoc.fileId} after Role 2 signed. Workflow might stall if email wasn't pre-set correctly or updated via another means.`);
                 // If the email was already set correctly in `doc.signers.role3Email`, the workflow might proceed if OpenSignLabs allows pre-setting it.
            }

        } else if (eventType === 'document_completed') {
            relevantDoc.status = 'completed';
            this.logger.log(`Document ${relevantDoc.fileId} signing completed.`);
            // Final actions: notify Role 1, store final PDF etc.

        } else if (eventType === 'document_declined' || eventType === 'document_expired') {
             relevantDoc.status = 'failed';
             this.logger.warn(`Document ${relevantDoc.fileId} signing process failed or expired. Event: ${eventType}`);
             // Handle failure

        } else {
            this.logger.log(`Unhandled or informational webhook event type: ${eventType} for document ${relevantDoc.fileId}`);
        }

        this.documents.set(relevantDoc.fileId, relevantDoc); // Save updated state
        return { received: true, message: 'Webhook processed successfully.' };

    } catch (error) {
        this.logger.error(`Error processing webhook for document ${relevantDoc.fileId}: ${error.message}`, error.stack);
        return { received: true, message: 'Webhook processing failed.', error: error.message };
    }
  }

  getDocumentStatus(fileId: string): DocumentState {
    const doc = this.documents.get(fileId);
    if (!doc) {
      throw new NotFoundException(`Document with ID ${fileId} not found.`);
    }
    return doc;
  }

  // --- Placeholder for Update Recipient API Call --- 
  // private async updateOpenSignRecipient(templateId: string, roleName: string, newEmail: string): Promise<void> { ... }

}

