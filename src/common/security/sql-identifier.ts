import { BadRequestException } from '@nestjs/common';

const SQL_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function escapeSqlIdentifier(identifier: string): string {
  if (!SQL_IDENTIFIER.test(identifier)) {
    throw new BadRequestException(`Invalid SQL identifier: ${identifier}`);
  }
  return `\`${identifier}\``;
}
