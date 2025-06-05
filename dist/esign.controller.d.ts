import { EsignService } from './esign.service';
import { Response } from 'express';
export declare class EsignController {
    private readonly esignService;
    constructor(esignService: EsignService);
    uploadFile(file: Express.Multer.File): Promise<import("./esign.service").DocumentState | {
        message: string;
    }>;
    addTags(fileId: string, tagData: any): import("./esign.service").DocumentState;
    previewPdf(filename: string, res: Response): void;
    submitForEsign(fileId: string, signers: any): Promise<any>;
    handleWebhook(webhookData: any): Promise<any>;
}
