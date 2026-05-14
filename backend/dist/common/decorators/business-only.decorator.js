"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BusinessOnly = exports.BUSINESS_ONLY_KEY = void 0;
const common_1 = require("@nestjs/common");
exports.BUSINESS_ONLY_KEY = 'businessOnly';
const BusinessOnly = () => (0, common_1.SetMetadata)(exports.BUSINESS_ONLY_KEY, true);
exports.BusinessOnly = BusinessOnly;
//# sourceMappingURL=business-only.decorator.js.map