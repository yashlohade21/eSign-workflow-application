
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EsignModule } from './esign/esign.module';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios'; // Import HttpModule

@Module({
  imports: [
    ConfigModule.forRoot({ // Configure ConfigModule globally
      isGlobal: true, // Make ConfigService available throughout the app
    }),
    HttpModule, // Import HttpModule here if EsignService needs it globally, or import in EsignModule
    EsignModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

