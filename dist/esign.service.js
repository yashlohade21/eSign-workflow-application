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
var EsignService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EsignService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("@nestjs/axios");
const config_1 = require("@nestjs/config");
const rxjs_1 = require("rxjs");
const fs = require("fs/promises");
const path = require("path");
let EsignService = EsignService_1 = class EsignService {
    httpService;
    configService;
    documents = new Map();
    logger = new common_1.Logger(EsignService_1.name);
    constructor(httpService, configService) {
        this.httpService = httpService;
        this.configService = configService;
    }
    handlePdfUpload(file) {
        const fileId = path.parse(file.filename).name;
        const docState = {
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
    addTagsToFile(fileId, tagData) {
        const doc = this.documents.get(fileId);
        if (!doc) {
            throw new common_1.NotFoundException(`Document with ID ${fileId} not found.`);
        }
        if (!tagData || !Array.isArray(tagData.widgets)) {
            this.logger.warn(`Invalid or missing tag structure for document ${fileId}. Expected { widgets: [...] }`);
            throw new common_1.InternalServerErrorException('Invalid tag data format provided.');
        }
        doc.tags = tagData;
        doc.status = 'tagged';
        this.documents.set(fileId, doc);
        this.logger.log(`Tags added to document ${fileId}`);
        return doc;
    }
    async submitToOpenSign(fileId, signers) {
        const doc = this.documents.get(fileId);
        if (!doc) {
            throw new common_1.NotFoundException(`Document with ID ${fileId} not found.`);
        }
        if (!doc.tags || !Array.isArray(doc.tags.widgets) || doc.tags.widgets.length === 0) {
            this.logger.error(`Tags missing or invalid for document ${fileId}`);
            throw new common_1.InternalServerErrorException('Tags must be added and valid before submitting for signing.');
        }
        if (!signers || !signers.role1Email) {
            this.logger.error(`Signer information missing for document ${fileId}`);
            throw new common_1.InternalServerErrorException('Signer information (at least Role 1 email) is required.');
        }
        this.logger.log(`Preparing to submit document ${fileId} to OpenSignLabs...`);
        doc.signers = signers;
        doc.role3Email = signers.role3Email || '';
        const apiKey = this.configService.get('OPENSIGN_API_KEY', 'YOUR_API_KEY_HERE');
        const apiUrl = this.configService.get('OPENSIGN_API_URL', 'https://sandbox.opensignlabs.com/api/v1/createtemplate');
        let pdfBase64;
        try {
            const fileBuffer = await fs.readFile(doc.filePath);
            pdfBase64 = fileBuffer.toString('base64');
            this.logger.log(`Read and encoded PDF file ${doc.filePath} for document ${fileId}`);
        }
        catch (error) {
            this.logger.error(`Failed to read PDF file ${doc.filePath}: ${error.message}`, error.stack);
            doc.status = 'failed';
            this.documents.set(fileId, doc);
            throw new common_1.InternalServerErrorException('Failed to read PDF file for submission.');
        }
        const roles = [
            { role: 'Role 1', email: signers.role1Email, name: 'Role 1 Signer' },
            { role: 'Role 2', email: signers.role2Email || 'dummy-role2@example.com', name: 'Role 2 Signer' },
            { role: 'Role 3', email: '', name: 'Role 3 Signer' }
        ];
        const payload = {
            file: pdfBase64,
            title: `Signing Request - ${doc.originalFilename} (${fileId})`,
            sendInOrder: true,
            roles: roles,
            widgets: doc.tags.widgets
        };
        this.logger.log(`Submitting payload to OpenSignLabs for document ${fileId}`);
        try {
            const response = await (0, rxjs_1.firstValueFrom)(this.httpService.post(apiUrl, payload, {
                headers: {
                    'x-api-token': apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }));
            if (response.data && response.data.objectId) {
                doc.openSignTemplateId = response.data.objectId;
                doc.status = 'submitted';
                this.documents.set(fileId, doc);
                this.logger.log(`Document ${fileId} submitted successfully. Template ID: ${doc.openSignTemplateId}`);
                return { success: true, message: 'Document submitted successfully.', templateId: doc.openSignTemplateId };
            }
            else {
                this.logger.error(`Unexpected response structure from OpenSignLabs for document ${fileId}: ${JSON.stringify(response.data)}`);
                doc.status = 'failed';
                this.documents.set(fileId, doc);
                throw new common_1.InternalServerErrorException('Received unexpected response from signing service.');
            }
        }
        catch (error) {
            this.logger.error(`Error submitting document ${fileId} to OpenSignLabs: ${error.message}`, error.stack);
            if (error.response) {
                this.logger.error(`OpenSignLabs API Error Response: Status ${error.response.status}, Data: ${JSON.stringify(error.response.data)}`);
            }
            doc.status = 'failed';
            this.documents.set(fileId, doc);
            const apiErrorMsg = error.response?.data?.message || 'Failed to communicate with signing service.';
            throw new common_1.InternalServerErrorException(`Failed to submit document for signing: ${apiErrorMsg}`);
        }
    }
    async handleWebhookEvent(webhookData) {
        this.logger.log(`Received webhook event: ${JSON.stringify(webhookData)}`);
        const eventType = webhookData.event?.type;
        const templateId = webhookData.template_id;
        const documentId = webhookData.document_id;
        const signerInfo = webhookData.signer;
        if (!templateId && !documentId) {
            this.logger.warn('Webhook received without template_id or document_id.');
            return { received: true, message: 'Webhook ignored (missing identifier).' };
        }
        let relevantDoc;
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
            if (eventType === 'document_signed' && signerInfo?.role === 'Role 2') {
                this.logger.log(`Document ${relevantDoc.fileId} signed by Role 2.`);
                relevantDoc.status = 'signed_by_role2';
                const updatedRole3Email = webhookData.updated_emails?.Role3 || webhookData.role3_email;
                if (updatedRole3Email && updatedRole3Email !== relevantDoc.role3Email) {
                    this.logger.log(`Webhook indicates Role 3 email updated for document ${relevantDoc.fileId} to ${updatedRole3Email}`);
                    relevantDoc.role3Email = updatedRole3Email;
                    this.logger.warn(`Placeholder: Need to call OpenSignLabs API to update Role 3 email to ${updatedRole3Email} for template ${relevantDoc.openSignTemplateId}`);
                }
                else {
                    this.logger.warn(`Role 3 email not found in webhook payload for document ${relevantDoc.fileId} after Role 2 signed. Workflow might stall if email wasn't pre-set correctly or updated via another means.`);
                }
            }
            else if (eventType === 'document_completed') {
                relevantDoc.status = 'completed';
                this.logger.log(`Document ${relevantDoc.fileId} signing completed.`);
            }
            else if (eventType === 'document_declined' || eventType === 'document_expired') {
                relevantDoc.status = 'failed';
                this.logger.warn(`Document ${relevantDoc.fileId} signing process failed or expired. Event: ${eventType}`);
            }
            else {
                this.logger.log(`Unhandled or informational webhook event type: ${eventType} for document ${relevantDoc.fileId}`);
            }
            this.documents.set(relevantDoc.fileId, relevantDoc);
            return { received: true, message: 'Webhook processed successfully.' };
        }
        catch (error) {
            this.logger.error(`Error processing webhook for document ${relevantDoc.fileId}: ${error.message}`, error.stack);
            return { received: true, message: 'Webhook processing failed.', error: error.message };
        }
    }
    getDocumentStatus(fileId) {
        const doc = this.documents.get(fileId);
        if (!doc) {
            throw new common_1.NotFoundException(`Document with ID ${fileId} not found.`);
        }
        return doc;
    }
};
exports.EsignService = EsignService;
exports.EsignService = EsignService = EsignService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [axios_1.HttpService,
        config_1.ConfigService])
], EsignService);
//# sourceMappingURL=esign.service.js.map