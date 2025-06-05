
import { Test, TestingModule } from '@nestjs/testing';
import { EsignService } from './esign.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import * as fs from 'fs/promises';
import { Readable } from 'stream'; // Import Readable directly

// Mock HttpService
const mockHttpService = {
  post: jest.fn(),
};

// Mock ConfigService
const mockConfigService = {
  get: jest.fn((key: string, defaultValue?: any) => {
    if (key === 'OPENSIGN_API_KEY') return 'test-api-key';
    if (key === 'OPENSIGN_API_URL') return 'https://fake-opensign-api.com/createtemplate';
    return defaultValue;
  }),
};

// Mock fs/promises
jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
}));

describe('EsignService', () => {
  let service: EsignService;
  let httpService: HttpService;

  beforeEach(async () => {
    // Reset mocks before each test
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EsignService,
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<EsignService>(EsignService);
    httpService = module.get<HttpService>(HttpService);

    // Clear in-memory documents before each test
    (service as any).documents.clear();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handlePdfUpload', () => {
    it('should store document state and return it', () => {
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'test.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 12345,
        destination: './uploads',
        filename: 'unique-123.pdf',
        path: './uploads/unique-123.pdf',
        buffer: Buffer.from('test pdf content'),
        stream: new Readable(), // Fixed: Provide a valid Readable stream instance
      };

      const result = service.handlePdfUpload(mockFile);
      const fileId = 'unique-123';

      expect(result).toBeDefined();
      expect(result.fileId).toEqual(fileId);
      expect(result.originalFilename).toEqual('test.pdf');
      expect(result.savedFilename).toEqual('unique-123.pdf');
      expect(result.status).toEqual('uploaded');
      expect((service as any).documents.get(fileId)).toEqual(result);
    });
  });

  describe('addTagsToFile', () => {
    const fileId = 'doc-1';
    const mockDocState = {
        fileId: fileId,
        originalFilename: 'orig.pdf',
        savedFilename: 'doc-1.pdf',
        filePath: './uploads/doc-1.pdf',
        status: 'uploaded',
    };

    beforeEach(() => {
        (service as any).documents.set(fileId, { ...mockDocState }); // Reset state
    });

    it('should add tags and update status', () => {
      const tagData = { widgets: [{ type: 'signature', page: 1, x: 100, y: 100 }] };
      const result = service.addTagsToFile(fileId, tagData);

      expect(result.tags).toEqual(tagData);
      expect(result.status).toEqual('tagged');
      expect((service as any).documents.get(fileId).status).toEqual('tagged');
    });

    it('should throw NotFoundException if document doesnt exist', () => {
      const tagData = { widgets: [] };
      expect(() => service.addTagsToFile('non-existent-id', tagData)).toThrow(NotFoundException);
    });

    it('should throw InternalServerErrorException for invalid tag format', () => {
        const invalidTagData = { something: 'else' };
        expect(() => service.addTagsToFile(fileId, invalidTagData)).toThrow(InternalServerErrorException);
        expect(() => service.addTagsToFile(fileId, { widgets: 'not-an-array' })).toThrow(InternalServerErrorException);
    });
  });

  describe('submitToOpenSign', () => {
    const fileId = 'doc-submit';
    const mockDocState = {
        fileId: fileId,
        originalFilename: 'submit.pdf',
        savedFilename: 'doc-submit.pdf',
        filePath: './uploads/doc-submit.pdf',
        status: 'tagged',
        tags: { widgets: [{ type: 'signature', page: 1, x: 50, y: 50 }] },
    };
    const signers = { role1Email: 'role1@test.com' };

    beforeEach(() => {
        (service as any).documents.set(fileId, { ...mockDocState });
        // Mock fs.readFile to succeed
        (fs.readFile as jest.Mock).mockResolvedValue(Buffer.from('pdf content'));
    });

    it('should successfully submit to OpenSignLabs API', async () => {
      const apiResponse = { data: { objectId: 'template-xyz', message: 'Success' } };
      mockHttpService.post.mockReturnValue(of(apiResponse)); // Mock successful API call

      const result = await service.submitToOpenSign(fileId, signers);

      expect(fs.readFile).toHaveBeenCalledWith(mockDocState.filePath);
      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://fake-opensign-api.com/createtemplate',
        expect.objectContaining({ file: expect.any(String), roles: expect.any(Array), widgets: mockDocState.tags.widgets }),
        expect.objectContaining({ headers: { 'x-api-token': 'test-api-key', 'Content-Type': 'application/json' } })
      );
      expect(result.success).toBe(true);
      expect(result.templateId).toEqual('template-xyz');
      expect((service as any).documents.get(fileId).status).toEqual('submitted');
      expect((service as any).documents.get(fileId).openSignTemplateId).toEqual('template-xyz');
    });

    it('should throw NotFoundException if document doesnt exist', async () => {
      await expect(service.submitToOpenSign('non-existent-id', signers)).rejects.toThrow(NotFoundException);
    });

    it('should throw InternalServerErrorException if tags are missing', async () => {
        const docWithoutTags = { ...mockDocState, tags: undefined };
        (service as any).documents.set(fileId, docWithoutTags);
        await expect(service.submitToOpenSign(fileId, signers)).rejects.toThrow(InternalServerErrorException);
    });

    it('should throw InternalServerErrorException if signers are missing', async () => {
        await expect(service.submitToOpenSign(fileId, {})).rejects.toThrow(InternalServerErrorException);
    });

    it('should throw InternalServerErrorException if reading file fails', async () => {
        (fs.readFile as jest.Mock).mockRejectedValue(new Error('Read error'));
        await expect(service.submitToOpenSign(fileId, signers)).rejects.toThrow(InternalServerErrorException);
        expect((service as any).documents.get(fileId).status).toEqual('failed');
    });

    it('should throw InternalServerErrorException on API error', async () => {
        const apiError = { response: { status: 500, data: { message: 'API Failed' } } };
        mockHttpService.post.mockReturnValue(throwError(() => apiError)); // Mock failed API call

        await expect(service.submitToOpenSign(fileId, signers)).rejects.toThrow(InternalServerErrorException);
        expect((service as any).documents.get(fileId).status).toEqual('failed');
    });

     it('should throw InternalServerErrorException on unexpected API response', async () => {
        const badApiResponse = { data: { message: 'Wrong format' } }; // Missing objectId
        mockHttpService.post.mockReturnValue(of(badApiResponse));

        await expect(service.submitToOpenSign(fileId, signers)).rejects.toThrow(InternalServerErrorException);
        expect((service as any).documents.get(fileId).status).toEqual('failed');
    });
  });

  describe('handleWebhookEvent', () => {
    const fileId = 'doc-webhook';
    const templateId = 'template-abc';
    const mockDocState = {
        fileId: fileId,
        originalFilename: 'webhook.pdf',
        savedFilename: 'doc-webhook.pdf',
        filePath: './uploads/doc-webhook.pdf',
        status: 'submitted',
        openSignTemplateId: templateId,
        role3Email: '',
    };

    beforeEach(() => {
        (service as any).documents.set(fileId, { ...mockDocState });
    });

    it('should update status to signed_by_role2 when Role 2 signs', async () => {
        const webhookData = {
            event: { type: 'document_signed' },
            template_id: templateId,
            signer: { role: 'Role 2' },
        };
        await service.handleWebhookEvent(webhookData);
        expect((service as any).documents.get(fileId).status).toEqual('signed_by_role2');
    });

    it('should update status and Role 3 email when Role 2 signs with updated email', async () => {
        const updatedEmail = 'new-role3@test.com';
        const webhookData = {
            event: { type: 'document_signed' },
            template_id: templateId,
            signer: { role: 'Role 2' },
            // Hypothetical field for updated email
            updated_emails: { Role3: updatedEmail }
        };
        await service.handleWebhookEvent(webhookData);
        const updatedDoc = (service as any).documents.get(fileId);
        expect(updatedDoc.status).toEqual('signed_by_role2');
        expect(updatedDoc.role3Email).toEqual(updatedEmail);
        // Check logger warning about needing API call (optional)
    });

    it('should update status to completed on document_completed event', async () => {
        const webhookData = {
            event: { type: 'document_completed' },
            template_id: templateId,
        };
        await service.handleWebhookEvent(webhookData);
        expect((service as any).documents.get(fileId).status).toEqual('completed');
    });

    it('should update status to failed on document_declined event', async () => {
        const webhookData = {
            event: { type: 'document_declined' },
            template_id: templateId,
        };
        await service.handleWebhookEvent(webhookData);
        expect((service as any).documents.get(fileId).status).toEqual('failed');
    });

    it('should ignore webhooks for unknown templates', async () => {
        const webhookData = { template_id: 'unknown-template' };
        const result = await service.handleWebhookEvent(webhookData);
        expect(result.message).toContain('unknown');
        // Ensure original doc state is unchanged
        expect((service as any).documents.get(fileId).status).toEqual('submitted');
    });

     it('should handle webhooks missing identifiers gracefully', async () => {
        const webhookData = { event: { type: 'some_event' } }; // No template_id or document_id
        const result = await service.handleWebhookEvent(webhookData);
        expect(result.message).toContain('ignored');
    });
  });

   describe('getDocumentStatus', () => {
        const fileId = 'doc-status';
        const mockDocState = { fileId: fileId, status: 'uploaded' } as any;

        it('should return document status', () => {
            (service as any).documents.set(fileId, mockDocState);
            const result = service.getDocumentStatus(fileId);
            expect(result).toEqual(mockDocState);
        });

        it('should throw NotFoundException if document doesnt exist', () => {
            expect(() => service.getDocumentStatus('non-existent-id')).toThrow(NotFoundException);
        });
    });
});

