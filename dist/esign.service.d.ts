import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
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
export declare class EsignService {
    private readonly httpService;
    private readonly configService;
    private documents;
    private readonly logger;
    constructor(httpService: HttpService, configService: ConfigService);
    handlePdfUpload(file: Express.Multer.File): DocumentState;
    addTagsToFile(fileId: string, tagData: any): DocumentState;
    submitToOpenSign(fileId: string, signers: any): Promise<any>;
    handleWebhookEvent(webhookData: any): Promise<any>;
    getDocumentStatus(fileId: string): DocumentState;
}
