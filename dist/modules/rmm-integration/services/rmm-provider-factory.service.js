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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RmmProviderFactory = void 0;
const common_1 = require("@nestjs/common");
const connectwise_provider_1 = require("../providers/connectwise.provider");
const ninjaone_provider_1 = require("../providers/ninjaone.provider");
const datto_provider_1 = require("../providers/datto.provider");
let RmmProviderFactory = class RmmProviderFactory {
    constructor() {
        this.providers = new Map();
        const connectwise = new connectwise_provider_1.ConnectWiseProvider();
        const ninjaone = new ninjaone_provider_1.NinjaOneProvider();
        const datto = new datto_provider_1.DattoProvider();
        this.providers.set(connectwise.name, connectwise);
        this.providers.set(ninjaone.name, ninjaone);
        this.providers.set(datto.name, datto);
    }
    getProvider(name) {
        const provider = this.providers.get(name.toLowerCase());
        if (!provider)
            throw new Error(`Unsupported RMM provider: ${name}`);
        return provider;
    }
    listProviders() {
        return Array.from(this.providers.keys());
    }
};
exports.RmmProviderFactory = RmmProviderFactory;
exports.RmmProviderFactory = RmmProviderFactory = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], RmmProviderFactory);
//# sourceMappingURL=rmm-provider-factory.service.js.map