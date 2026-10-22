import React from 'react';
import {OperationsView} from '../OperationsView';
export function PurchasesView({suppliers=false}:{suppliers?:boolean}){return <OperationsView module="purchases" suppliers={suppliers}/>;}
