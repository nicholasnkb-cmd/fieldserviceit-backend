"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getS3Client = getS3Client;
exports.getS3Bucket = getS3Bucket;
const client_s3_1 = require("@aws-sdk/client-s3");
let s3Client = null;
function getS3Client(config) {
    const type = config.get('STORAGE_TYPE', 'local');
    if (type !== 's3')
        return null;
    if (!s3Client) {
        s3Client = new client_s3_1.S3Client({
            endpoint: config.get('S3_ENDPOINT'),
            region: config.get('S3_REGION', 'us-east-1'),
            credentials: {
                accessKeyId: config.get('S3_ACCESS_KEY_ID'),
                secretAccessKey: config.get('S3_SECRET_ACCESS_KEY'),
            },
            forcePathStyle: true,
        });
    }
    return s3Client;
}
function getS3Bucket(config) {
    return config.get('S3_BUCKET', 'fieldserviceit-uploads');
}
//# sourceMappingURL=s3.config.js.map