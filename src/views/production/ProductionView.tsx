import {SharedProductionQueue} from '../../components/SharedProductionQueue';
import {sharedProductionApi} from '../../services/sharedProductionApi';
export function ProductionView(){return <SharedProductionQueue api={sharedProductionApi}/>;}
