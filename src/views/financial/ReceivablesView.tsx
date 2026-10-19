import React from 'react';
import { UnavailableModule } from '../../components/common/UnavailableModule';
import type { Sale } from '../../types/erp';

export function ReceivablesView(_props: { onViewReceipt?: (sale: Sale) => void }) {
  return <UnavailableModule module="contas_receber" />;
}
