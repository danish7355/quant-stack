import React from 'react';
import { StrategyChecklistPanel, StrategyChecklistPanelProps } from './StrategyChecklistPanel';

export interface VcbChecklistPanelProps extends Partial<StrategyChecklistPanelProps> {
  settings: any;
  onUpdateSetting: (key: any, value: any) => void;
  selectedCoinVcbChecklist?: any;
  coins?: any[];
  onSelectSymbol?: (symbol: string) => void;
}

export const VcbChecklistPanel: React.FC<VcbChecklistPanelProps> = (props) => {
  return (
    <StrategyChecklistPanel
      settings={props.settings}
      onUpdateSetting={props.onUpdateSetting}
      selectedStrategyId="VOLATILITY_COMPRESSION"
      coins={props.coins}
      onSelectSymbol={props.onSelectSymbol}
      selectedSymbol={props.selectedCoinVcbChecklist?.symbol}
      globalFilterState={props.globalFilterState}
    />
  );
};

export { StrategyChecklistPanel };
export default VcbChecklistPanel;
