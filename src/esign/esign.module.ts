import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios'; // Add this import
import { ConfigModule } from '@nestjs/config'; // Add this import
import { EsignController } from '../esign.controller';
import { EsignService } from '../esign.service';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Module({
  imports: [
    HttpModule, // Add HttpModule
    ConfigModule, // Add ConfigModule
    MulterModule.register({
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
          const ext = extname(file.originalname);
          const filename = `${uniqueSuffix}${ext}`;
          cb(null, filename);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.originalname.match(/\.(pdf)$/i)) {
          return cb(new Error('Only PDF files are allowed!'), false);
        }
        cb(null, true);
      },
    }),
  ],
  controllers: [EsignController],
  providers: [EsignService],
})
export class EsignModule {}