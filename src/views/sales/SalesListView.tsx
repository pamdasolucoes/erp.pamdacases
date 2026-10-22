import React from 'react';
import type { CustomerContext } from '../../types/pamdaCore';
import { OfficialSalesView } from './OfficialSalesView';

interface SalesListViewProps {
  onNewSaleClick: () => void;
  onContinuePending: () => void;
  customerContext?: CustomerContext | null;
  onBackToCustomer?: () => void;
}
export const SalesListView: React.FC<SalesListViewProps> = props => <div className="space-y-4">
  {props.customerContext&&<div className="flex flex-wrap gap-4 text-sm"><button type="button" onClick={props.onBackToCustomer} className="text-blue-700 underline">Voltar ao cliente</button><button type="button" onClick={props.onNewSaleClick} className="text-blue-700 font-bold">+ Nova venda</button></div>}
  <OfficialSalesView customerId={props.customerContext?.id} onContinue={props.onContinuePending}/>
</div>;
