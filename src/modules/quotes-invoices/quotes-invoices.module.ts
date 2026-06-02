import { Module } from '@nestjs/common';
import { QuotesInvoicesController } from './quotes-invoices.controller';
import { QuotesInvoicesService } from './quotes-invoices.service';

@Module({
  controllers: [QuotesInvoicesController],
  providers: [QuotesInvoicesService],
})
export class QuotesInvoicesModule {}
