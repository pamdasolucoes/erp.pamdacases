import React from 'react';
import { UnavailableModule } from '../../components/common/UnavailableModule';

export function PurchasesView({ suppliers = false }: { suppliers?: boolean }) {
  return <UnavailableModule module={suppliers ? 'fornecedores' : 'compras'} />;
}
