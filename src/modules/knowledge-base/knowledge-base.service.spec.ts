import { BadRequestException } from '@nestjs/common';
import { KnowledgeBaseService } from './knowledge-base.service';

describe('KnowledgeBaseService SQL identifiers', () => {
  it.each(['title', 'reviewDueAt', '_private2'])('quotes valid update column %p', (column) => {
    const service = new KnowledgeBaseService({} as any);

    expect((service as any).escapeColumn(column)).toBe(`\`${column}\``);
  });

  it.each(['title` = title --', 'title; DROP TABLE User', 'article.title', 'two words'])(
    'rejects unsafe update column %p',
    (column) => {
      const service = new KnowledgeBaseService({} as any);

      expect(() => (service as any).escapeColumn(column)).toThrow(BadRequestException);
    },
  );
});
