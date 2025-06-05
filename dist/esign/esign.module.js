"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EsignModule = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("@nestjs/axios");
const config_1 = require("@nestjs/config");
const esign_controller_1 = require("../esign.controller");
const esign_service_1 = require("../esign.service");
const platform_express_1 = require("@nestjs/platform-express");
const multer_1 = require("multer");
const path_1 = require("path");
let EsignModule = class EsignModule {
};
exports.EsignModule = EsignModule;
exports.EsignModule = EsignModule = __decorate([
    (0, common_1.Module)({
        imports: [
            axios_1.HttpModule,
            config_1.ConfigModule,
            platform_express_1.MulterModule.register({
                storage: (0, multer_1.diskStorage)({
                    destination: './uploads',
                    filename: (req, file, cb) => {
                        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                        const ext = (0, path_1.extname)(file.originalname);
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
        controllers: [esign_controller_1.EsignController],
        providers: [esign_service_1.EsignService],
    })
], EsignModule);
//# sourceMappingURL=esign.module.js.map