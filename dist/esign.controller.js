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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EsignController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const esign_service_1 = require("./esign.service");
const path_1 = require("path");
let EsignController = class EsignController {
    esignService;
    constructor(esignService) {
        this.esignService = esignService;
    }
    async uploadFile(file) {
        console.log('Uploaded file:', file);
        if (!file) {
            return { message: 'File upload failed or invalid file type.' };
        }
        return this.esignService.handlePdfUpload(file);
    }
    addTags(fileId, tagData) {
        console.log(`Adding tags for file ${fileId}:`, tagData);
        return this.esignService.addTagsToFile(fileId, tagData);
    }
    previewPdf(filename, res) {
        const filePath = (0, path_1.join)(process.cwd(), 'uploads', filename);
        console.log(`Serving file for preview: ${filePath}`);
        return res.sendFile(filePath);
    }
    submitForEsign(fileId, signers) {
        console.log(`Submitting file ${fileId} for eSign with signers:`, signers);
        return this.esignService.submitToOpenSign(fileId, signers);
    }
    handleWebhook(webhookData) {
        console.log('Received webhook:', webhookData);
        return this.esignService.handleWebhookEvent(webhookData);
    }
};
exports.EsignController = EsignController;
__decorate([
    (0, common_1.Post)('upload'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file')),
    __param(0, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], EsignController.prototype, "uploadFile", null);
__decorate([
    (0, common_1.Post)('add-tags/:fileId'),
    __param(0, (0, common_1.Param)('fileId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], EsignController.prototype, "addTags", null);
__decorate([
    (0, common_1.Get)('preview/:filename'),
    __param(0, (0, common_1.Param)('filename')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], EsignController.prototype, "previewPdf", null);
__decorate([
    (0, common_1.Post)('submit/:fileId'),
    __param(0, (0, common_1.Param)('fileId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], EsignController.prototype, "submitForEsign", null);
__decorate([
    (0, common_1.Post)('webhook'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], EsignController.prototype, "handleWebhook", null);
exports.EsignController = EsignController = __decorate([
    (0, common_1.Controller)('esign'),
    __metadata("design:paramtypes", [esign_service_1.EsignService])
], EsignController);
//# sourceMappingURL=esign.controller.js.map