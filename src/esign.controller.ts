
import { Controller, Post, UploadedFile, UseInterceptors, Body, Get, Param, Res } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { EsignService } from './esign.service';
import { Response } from 'express';
import { join } from 'path';

@Controller('esign')
export class EsignController {
  constructor(private readonly esignService: EsignService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file')) // 'file' is the field name in the form-data
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    // Basic handling: return file info. Service logic can be expanded later.
    console.log('Uploaded file:', file);
    if (!file) {
        // Handle case where file is not uploaded or filtered out
        return { message: 'File upload failed or invalid file type.' };
    }
    // In a real app, you'd likely save file metadata to a DB via the service
    return this.esignService.handlePdfUpload(file);
  }

  // Placeholder for adding tags - requires more details on how tags are defined/sent
  @Post('add-tags/:fileId')
  addTags(@Param('fileId') fileId: string, @Body() tagData: any) {
    console.log(`Adding tags for file ${fileId}:`, tagData);
    // Call service method to associate tags with the file/document record
    return this.esignService.addTagsToFile(fileId, tagData);
  }

  // Placeholder for previewing PDF - might serve the file or return its path/URL
  @Get('preview/:filename')
  previewPdf(@Param('filename') filename: string, @Res() res: Response) {
    // Construct the absolute path to the file
    const filePath = join(process.cwd(), 'uploads', filename);
    console.log(`Serving file for preview: ${filePath}`);
    // In a real app, add security checks (user authorization, etc.)
    return res.sendFile(filePath);
  }

  // Placeholder for submitting for eSign - triggers the OpenSignLabs API call
  @Post('submit/:fileId')
  submitForEsign(@Param('fileId') fileId: string, @Body() signers: any) {
    console.log(`Submitting file ${fileId} for eSign with signers:`, signers);
    // Call service method to initiate the signing process via OpenSignLabs
    return this.esignService.submitToOpenSign(fileId, signers);
  }

   // Placeholder for webhook endpoint
   @Post('webhook')
   handleWebhook(@Body() webhookData: any) {
     console.log('Received webhook:', webhookData);
     return this.esignService.handleWebhookEvent(webhookData);
   }
}

